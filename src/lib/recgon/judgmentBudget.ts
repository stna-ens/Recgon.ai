// Phase 3 Plan 02 — Per-team daily safety cap for the LLM judgment overlay.
//
// JUDGE-10: "Per-team daily LLM safety cap exists" — silent math-fallback
// past the cap; AT-MOST-ONE dev-ops email per (team, day) on cap hit.
//
// This module is the SINGLE budget-enforcement surface (T-03-02-01). The
// dispatcher calls `checkAndIncrement(teamId)` before invoking the judge; if
// it returns `allowed:false`, the dispatcher fires `alertCapExceededOnce` and
// silently falls back to math-only assignment.
//
// Concurrency note (T-03-02-03, accepted): two cron runs racing the boundary
// could both pass the cap check and both increment, briefly exceeding 50.
// Acceptable — cap is a SAFETY rail, not a hard quota. Cron is 1/minute, the
// race window is small, and the rollback path here keeps the post-failure
// counter ≤ cap on any non-racing rejection. Per RESEARCH Q4 note 2.

import { Resend } from 'resend';
import { logger } from '../logger';
import { supabase } from '../supabase';

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Per-team daily judgment-call ceiling. Set per CONTEXT D-30 as ~5× expected
 * peak under "every dispatch is a close call". A real call costs roughly
 * $0.001 (Gemini 2.5 Flash), so the cap budgets at ~$0.05/team/day in the
 * absolute worst case. Adjust here, not via env — owners don't see it.
 */
export const DAILY_JUDGMENT_CALL_CAP = 50;

// ── Date helpers ───────────────────────────────────────────────────────────

/**
 * Current UTC date as `YYYY-MM-DD`. Used as the partition key for the
 * per-team-per-day counter. UTC keeps the boundary deterministic across
 * Vercel regions and avoids DST shifts.
 */
export function currentUsageDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Public API ─────────────────────────────────────────────────────────────

export type CheckAndIncrementResult =
  | { allowed: true; callsToday: number }
  | { allowed: false; callsToday: number; reason: 'cap_exceeded' };

/**
 * Check today's counter for `teamId`; if under cap, increment and return
 * `allowed:true`; if at/over cap, do NOT increment and return `allowed:false`.
 *
 * Implementation pattern: select-current → if-under-cap upsert-with-increment →
 * if-over-cap return-rejection. Concurrent racers may both pass the cap
 * check (T-03-02-03 accepted); the cap is a soft safety rail per D-30.
 *
 * The post-condition `callsToday <= DAILY_JUDGMENT_CALL_CAP` is guaranteed
 * in the non-racing case because we read-then-conditionally-write. Under
 * race, post-condition may briefly hit `cap + 1` for the duration of one
 * cron tick — acceptable.
 */
export async function checkAndIncrement(teamId: string): Promise<CheckAndIncrementResult> {
  const usageDate = currentUsageDate();

  // Read current row. If absent, today's count is 0 and we'll insert.
  const existing = await readUsageRow(teamId, usageDate);
  const currentCalls = existing?.judgment_calls ?? 0;

  if (currentCalls >= DAILY_JUDGMENT_CALL_CAP) {
    // Already at cap — refuse without incrementing.
    return { allowed: false, callsToday: currentCalls, reason: 'cap_exceeded' };
  }

  // Upsert with the new count. If no row yet, this inserts with calls=1.
  // If a row exists, we send judgment_calls = currentCalls + 1.
  const newCalls = currentCalls + 1;
  try {
    const { error } = await (supabase
      .from('team_llm_usage')
      .upsert({
        team_id: teamId,
        usage_date: usageDate,
        judgment_calls: newCalls,
        cap_alert_sent: existing?.cap_alert_sent ?? false,
      }) as unknown as Promise<{ error: unknown }>);

    if (error) {
      // Database write failed. Fail open: log + treat as allowed so we don't
      // block real dispatches over a transient DB hiccup. The caller still
      // gets a normal result; the counter just didn't bump this round.
      logger.warn('judgmentBudget upsert failed; failing open', {
        teamId,
        usageDate,
        err: stringifyErr(error),
      });
    }
  } catch (err) {
    logger.warn('judgmentBudget upsert threw; failing open', {
      teamId,
      usageDate,
      err: stringifyErr(err),
    });
  }

  return { allowed: true, callsToday: newCalls };
}

/**
 * Send the cap-exhausted dev-ops alert AT MOST ONCE per `(teamId, usageDate)`.
 * Sets `cap_alert_sent=true` after the first call; subsequent calls for the
 * same key are no-ops (read → branch → return).
 *
 * The Resend send is best-effort; failure is logged but does not throw.
 * `DEV_OPS_ALERT_EMAIL` env governs whether the email actually fires — when
 * unset, we still flip the flag so the no-op semantics on repeat calls work
 * correctly (idempotency comes from the FLAG, not the email).
 *
 * T-03-02-02: body contains only the team UUID and date — no per-team data
 * beyond what's needed to debug the cap-hit event.
 */
export async function alertCapExceededOnce(
  teamId: string,
  usageDate: string,
): Promise<void> {
  // Read the flag first — idempotency check.
  const existing = await readUsageRow(teamId, usageDate);
  if (existing?.cap_alert_sent) {
    // Already sent. No-op.
    return;
  }

  // Flip the flag in the DB. We do this BEFORE the email send so the next
  // call short-circuits at the read-the-flag step even if the email errors.
  const { error: updateErr } = await (supabase
    .from('team_llm_usage')
    .update({ cap_alert_sent: true })
    .eq('team_id', teamId)
    .eq('usage_date', usageDate) as unknown as Promise<{ error: unknown }>);

  if (updateErr) {
    logger.warn('judgmentBudget alert flag update failed; skipping email', {
      teamId,
      usageDate,
      err: stringifyErr(updateErr),
    });
    return;
  }

  logger.warn('llm_judgment_cap_exceeded', { teamId, usageDate });

  // Optionally send the dev-ops email. Single env var, single recipient.
  const to = process.env.DEV_OPS_ALERT_EMAIL;
  if (!to) {
    // No address configured — log-only is the documented fallback (D-30).
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('judgmentBudget: DEV_OPS_ALERT_EMAIL set but RESEND_API_KEY missing', {
      teamId,
      usageDate,
    });
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: 'Recgon <noreply@recgon.app>',
      to,
      subject: `Recgon: judgment cap hit for team ${teamId} on ${usageDate}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; padding: 1.5rem;">
          <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0 0 0.75rem;">Daily judgment cap hit</h2>
          <p style="color: #444; margin: 0 0 0.5rem;">Team <code>${teamId}</code> reached the <strong>${DAILY_JUDGMENT_CALL_CAP}</strong>-call daily cap on <strong>${usageDate}</strong> (UTC).</p>
          <p style="color: #444; margin: 0 0 0.5rem;">Further close-call dispatches today are silently using math-only assignment.</p>
          <p style="color: #888; font-size: 0.85rem; margin: 1rem 0 0;">This is the only alert that will fire for this team today.</p>
        </div>
      `,
    });
    if (error) {
      logger.warn('judgmentBudget Resend returned error', {
        teamId,
        usageDate,
        err: stringifyErr(error),
      });
    }
  } catch (err) {
    logger.warn('judgmentBudget Resend send threw', {
      teamId,
      usageDate,
      err: stringifyErr(err),
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

type UsageRow = {
  team_id: string;
  usage_date: string;
  judgment_calls: number;
  cap_alert_sent: boolean;
};

async function readUsageRow(teamId: string, usageDate: string): Promise<UsageRow | null> {
  // Wrap the chained call in try/catch — if a test or transient DB error
  // breaks the chain, treat as "no row" rather than throwing. The cap is a
  // safety rail (T-03-02-03); a failed read should not block real dispatch.
  try {
    const { data } = await (supabase
      .from('team_llm_usage')
      .select('team_id, usage_date, judgment_calls, cap_alert_sent')
      .eq('team_id', teamId)
      .eq('usage_date', usageDate)
      .maybeSingle() as unknown as Promise<{ data: UsageRow | null }>);
    return data ?? null;
  } catch (err) {
    logger.warn('judgmentBudget readUsageRow failed; treating as no row', {
      teamId,
      usageDate,
      err: stringifyErr(err),
    });
    return null;
  }
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

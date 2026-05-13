// Phase 3 Plan 02 — judgmentBudget.ts unit tests (RED scaffold).
//
// Covers JUDGE-10 (per-team daily safety cap) requirements:
//   - First call of a UTC day → allowed:true, callsToday:1
//   - 50th call → allowed:true, callsToday:50
//   - 51st call → allowed:false, reason:'cap_exceeded'
//   - Calls roll over at UTC midnight (mocked clock) → counter resets to 1
//   - alertCapExceededOnce is idempotent (1st call writes flag; 2nd is no-op)
//   - When DEV_OPS_ALERT_EMAIL is unset, alert still flips the flag but skips email
//
// We mock `@/lib/supabase` with a Map-backed fake of `team_llm_usage`. The
// `@/lib/email`-style Resend send is also mocked so no network is touched.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Map-backed fake of the team_llm_usage table ────────────────────────────
//
// Key: `${teamId}|${usageDate}` → { judgment_calls, cap_alert_sent }.
// We model select-then-update for the increment (single round-trip pattern)
// because the planner allows non-atomic updates per RESEARCH Q4 note 2.

type Row = { team_id: string; usage_date: string; judgment_calls: number; cap_alert_sent: boolean };

const fakeTable = new Map<string, Row>();

function key(teamId: string, usageDate: string): string {
  return `${teamId}|${usageDate}`;
}

// Helper for tests to seed rows.
function seedRow(teamId: string, usageDate: string, calls: number, alertSent = false): void {
  fakeTable.set(key(teamId, usageDate), {
    team_id: teamId,
    usage_date: usageDate,
    judgment_calls: calls,
    cap_alert_sent: alertSent,
  });
}

// ── Supabase mock ──────────────────────────────────────────────────────────
//
// Models the chained query builder shape the implementation uses:
//   supabase.from('team_llm_usage').select(...).eq(...).eq(...).maybeSingle()
//   supabase.from('team_llm_usage').upsert({ ... })
//   supabase.from('team_llm_usage').update({ ... }).eq(...).eq(...)

let resendSendCalls: Array<{ to: string; subject: string }> = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'team_llm_usage') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }) }),
        };
      }
      return makeTeamLlmUsageBuilder();
    },
  },
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: vi.fn(async ({ to, subject }: { to: string; subject: string }) => {
        resendSendCalls.push({ to, subject });
        return { error: null };
      }),
    };
  },
}));

function makeTeamLlmUsageBuilder() {
  let pendingTeamId: string | null = null;
  let pendingDate: string | null = null;

  const builder = {
    select: (_cols?: string) => builder,
    eq: (col: string, val: string) => {
      if (col === 'team_id') pendingTeamId = val;
      if (col === 'usage_date') pendingDate = val;
      return builder;
    },
    maybeSingle: async () => {
      if (!pendingTeamId || !pendingDate) return { data: null, error: null };
      const row = fakeTable.get(key(pendingTeamId, pendingDate)) ?? null;
      return { data: row, error: null };
    },
    upsert: async (
      input: { team_id: string; usage_date: string; judgment_calls?: number; cap_alert_sent?: boolean },
    ) => {
      const k = key(input.team_id, input.usage_date);
      const existing = fakeTable.get(k);
      const merged: Row = {
        team_id: input.team_id,
        usage_date: input.usage_date,
        judgment_calls: input.judgment_calls ?? existing?.judgment_calls ?? 0,
        cap_alert_sent: input.cap_alert_sent ?? existing?.cap_alert_sent ?? false,
      };
      fakeTable.set(k, merged);
      return { data: merged, error: null };
    },
    update: (patch: Partial<Row>) => {
      return {
        eq: (col: string, val: string) => {
          if (col === 'team_id') pendingTeamId = val;
          if (col === 'usage_date') pendingDate = val;
          return {
            eq: (col2: string, val2: string) => {
              if (col2 === 'team_id') pendingTeamId = val2;
              if (col2 === 'usage_date') pendingDate = val2;
              return Promise.resolve(applyUpdate());
            },
          };
        },
      };
      function applyUpdate() {
        if (!pendingTeamId || !pendingDate) return { data: null, error: null };
        const k = key(pendingTeamId, pendingDate);
        const existing = fakeTable.get(k);
        if (!existing) return { data: null, error: null };
        const merged: Row = { ...existing, ...patch };
        fakeTable.set(k, merged);
        return { data: merged, error: null };
      }
    },
  };
  return builder;
}

// ── Test suite ─────────────────────────────────────────────────────────────

import {
  checkAndIncrement,
  alertCapExceededOnce,
  DAILY_JUDGMENT_CALL_CAP,
  currentUsageDate,
} from '@/lib/recgon/judgmentBudget';

describe('judgmentBudget — daily safety cap (JUDGE-10)', () => {
  beforeEach(() => {
    fakeTable.clear();
    resendSendCalls = [];
    vi.useRealTimers();
    delete process.env.DEV_OPS_ALERT_EMAIL;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkAndIncrement', () => {
    it('exports DAILY_JUDGMENT_CALL_CAP as 50 per CONTEXT D-30', () => {
      expect(DAILY_JUDGMENT_CALL_CAP).toBe(50);
    });

    it('first call of a UTC day for a team returns allowed:true with callsToday:1', async () => {
      const result = await checkAndIncrement('team-a');
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.callsToday).toBe(1);
      }
    });

    it('50th call returns allowed:true with callsToday:50', async () => {
      seedRow('team-a', currentUsageDate(), 49);
      const result = await checkAndIncrement('team-a');
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.callsToday).toBe(50);
      }
    });

    it('51st call returns allowed:false with reason:cap_exceeded and rolls back the increment', async () => {
      seedRow('team-a', currentUsageDate(), 50);
      const result = await checkAndIncrement('team-a');
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe('cap_exceeded');
        expect(result.callsToday).toBe(50);
      }
      // Verify post-state: still 50 (rollback path kicked in if implementation
      // does a select-then-update; or the update simply never ran).
      const row = fakeTable.get(key('team-a', currentUsageDate()));
      expect(row?.judgment_calls).toBe(50);
    });

    it('counter resets to 1 when the UTC day rolls over (mocked clock)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-14T23:59:59Z'));
      const may14 = currentUsageDate();
      seedRow('team-a', may14, 50);

      vi.setSystemTime(new Date('2026-05-15T00:00:01Z'));
      const may15 = currentUsageDate();
      expect(may15).not.toBe(may14);

      const result = await checkAndIncrement('team-a');
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.callsToday).toBe(1);
      }
    });

    it('two teams are independent: team-a hitting cap does not affect team-b', async () => {
      seedRow('team-a', currentUsageDate(), 50);
      const a = await checkAndIncrement('team-a');
      expect(a.allowed).toBe(false);

      const b = await checkAndIncrement('team-b');
      expect(b.allowed).toBe(true);
      if (b.allowed) {
        expect(b.callsToday).toBe(1);
      }
    });
  });

  describe('alertCapExceededOnce', () => {
    it('is idempotent — first call flips the flag, second call is a no-op', async () => {
      const date = currentUsageDate();
      seedRow('team-a', date, 50, /*alertSent*/ false);

      await alertCapExceededOnce('team-a', date);
      expect(fakeTable.get(key('team-a', date))?.cap_alert_sent).toBe(true);

      // Second call → no-op. We can't directly observe "no write" via the
      // Map, but we CAN observe that no second email send fired.
      process.env.DEV_OPS_ALERT_EMAIL = 'ops@example.com';
      await alertCapExceededOnce('team-a', date);
      // Only ONE email send should have fired — and only if env was set the
      // first time (it wasn't in this test). So zero is the correct count.
      expect(resendSendCalls.length).toBe(0);
    });

    it('when DEV_OPS_ALERT_EMAIL is unset, still flips the flag but skips the email', async () => {
      const date = currentUsageDate();
      seedRow('team-a', date, 50, /*alertSent*/ false);
      delete process.env.DEV_OPS_ALERT_EMAIL;

      await alertCapExceededOnce('team-a', date);
      expect(fakeTable.get(key('team-a', date))?.cap_alert_sent).toBe(true);
      expect(resendSendCalls.length).toBe(0);
    });

    it('when DEV_OPS_ALERT_EMAIL is set, sends ONE email AND flips the flag', async () => {
      const date = currentUsageDate();
      seedRow('team-a', date, 50, /*alertSent*/ false);
      process.env.DEV_OPS_ALERT_EMAIL = 'ops@example.com';

      await alertCapExceededOnce('team-a', date);
      expect(fakeTable.get(key('team-a', date))?.cap_alert_sent).toBe(true);
      expect(resendSendCalls.length).toBe(1);
      expect(resendSendCalls[0].to).toBe('ops@example.com');
      expect(resendSendCalls[0].subject).toContain('team-a');
    });
  });
});

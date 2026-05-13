// Notifications module — used by Recgon when assigning tasks to humans.
//
// In-app notification = the inbox query (no separate "notifications" table
// needed; assigned tasks for a user are the inbox).
// Email = Resend, fire-and-forget.

import { Resend } from 'resend';
import { logger } from './logger';
import { supabase } from './supabase';
import { renderWhyYou } from './recgon/whyYou';
import type { AgentTask, AssignmentReasoning, Teammate } from './recgon/types';

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  );
}

async function getEmailForTeammate(teammate: Teammate): Promise<string | null> {
  if (!teammate.userId) return null;
  const { data } = await supabase
    .from('users')
    .select('email')
    .eq('id', teammate.userId)
    .maybeSingle();
  return (data?.email as string | undefined) ?? null;
}

// Minimal HTML escape for the rendered "Why you" sentence we inject into
// the email body. React Email would auto-escape, but here we hand-build the
// HTML string so we escape ourselves (T-03-03-04 defense in depth). The
// renderer already strips < >, but we re-escape & " ' here as well so a
// future renderer change can't open an injection hole.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifyTeammateAssigned(input: {
  teammate: Teammate;
  task: AgentTask;
  teamName: string;
  // Phase 3 / Plan 03 — when present, the email body adds a one-line
  // "Why you: <sentence>" callout between the task block and the CTA. When
  // null/undefined (legacy assignments without a reasoning envelope), the
  // line is omitted entirely.
  reasoning?: AssignmentReasoning | null;
}): Promise<void> {
  const email = await getEmailForTeammate(input.teammate);
  if (!email) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.debug('skipping assignment email — RESEND_API_KEY not set');
    return;
  }

  const resend = new Resend(apiKey);
  const inboxUrl = `${appBaseUrl()}/inbox`;
  const taskTitle = input.task.title;
  const taskDescription = input.task.description?.slice(0, 280) || '';
  const priority = `p${input.task.priority}`;

  // Render the "Why you" line ONLY when a reasoning envelope is present.
  // The renderer is the single source of truth for the copy (D-29) so the
  // pop-up and the email always say the same thing.
  const whyYouHtml = input.reasoning
    ? `<p style="font-size: 0.85rem; color: #444; margin: 0 0 1.25rem; padding: 0.75rem 1rem; background: #fff5f9; border-left: 2px solid #FF3D7F; border-radius: 6px;"><strong style="color: #FF3D7F;">Why you:</strong> ${escapeHtml(renderWhyYou(input.reasoning).sentence)}</p>`
    : '';

  try {
    const { error } = await resend.emails.send({
      from: 'Recgon <noreply@recgon.app>',
      to: email,
      subject: `Recgon assigned you a task: ${taskTitle}`,
      html: `
<div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 2rem;">
  <div style="font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; color: #FF3D7F; margin-bottom: 0.5rem;">RECGON · ADMIN · ${input.teamName.toUpperCase()}</div>
  <h2 style="font-size: 1.15rem; font-weight: 700; margin: 0 0 0.75rem; color: #111;">New task assigned</h2>
  <div style="padding: 1rem 1.25rem; background: #fafafa; border: 1px solid #eee; border-radius: 10px; margin: 0 0 1.25rem;">
    <div style="font-weight: 600; color: #111; margin-bottom: 0.35rem;">${taskTitle}</div>
    <div style="font-size: 0.85rem; color: #555; margin-bottom: 0.75rem;">${taskDescription}</div>
    <div style="font-size: 0.75rem; color: #888;">${priority} • ${input.task.kind.replace('_', ' ')}</div>
  </div>
  ${whyYouHtml}
  <a href="${inboxUrl}" style="display: inline-block; padding: 0.7rem 1.25rem; background: #FF3D7F; color: white; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 0.9rem;">Open inbox</a>
  <p style="color: #999; font-size: 0.78rem; margin: 1.5rem 0 0;">Recgon picked you because of your skills, current load, and past ratings. You can decline if it's not a fit — Recgon will reassign.</p>
</div>
      `,
    });
    if (error) {
      logger.warn('assignment email failed', { error: error.message, teammateId: input.teammate.id });
    }
  } catch (err) {
    logger.warn('assignment email threw', {
      err: err instanceof Error ? err.message : String(err),
      teammateId: input.teammate.id,
    });
  }
}

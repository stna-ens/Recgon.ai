import { Resend } from 'resend';
import { logger } from './logger';
import {
  OVERDUE_NUDGE_TEMPLATE,
  OVERDUE_ESCALATE_TEMPLATE,
  OVERDUE_RESCHEDULE_TEMPLATE,
} from './prompts';

const FROM_ADDRESS = 'Recgon <noreply@recgon.app>';

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `${code} is your Recgon verification code`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem;">Verify your email</h2>
        <p style="color: #666; margin: 0 0 1.5rem;">Enter this code to complete your Recgon account registration. It expires in 10 minutes.</p>
        <div style="font-size: 2rem; font-weight: 700; letter-spacing: 0.5rem; padding: 1rem 1.5rem; background: #f5f5f5; border-radius: 8px; display: inline-block; font-family: monospace;">${code}</div>
        <p style="color: #999; font-size: 0.8rem; margin: 1.5rem 0 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `${code} is your Recgon password reset code`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem;">Reset your password</h2>
        <p style="color: #666; margin: 0 0 1.5rem;">Enter this code to choose a new password for your Recgon account. It expires in 10 minutes.</p>
        <div style="font-size: 2rem; font-weight: 700; letter-spacing: 0.5rem; padding: 1rem 1.5rem; background: #f5f5f5; border-radius: 8px; display: inline-block; font-family: monospace;">${code}</div>
        <p style="color: #999; font-size: 0.8rem; margin: 1.5rem 0 0;">If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

export async function sendTeamInviteEmail(input: {
  to: string;
  teamName: string;
  inviterName: string;
  inviteUrl: string;
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.teamName} on Recgon`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem;">You're invited to ${escapeHtml(input.teamName)}</h2>
        <p style="color: #666; margin: 0 0 1.5rem;">${escapeHtml(input.inviterName)} invited you to join their team on Recgon. The invite expires in 7 days.</p>
        <a href="${input.inviteUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #c2357a; color: #fff; border-radius: 8px; font-weight: 600; text-decoration: none;">Join the team</a>
        <p style="color: #999; font-size: 0.8rem; margin: 1.5rem 0 0;">Or paste this link into your browser:<br>${input.inviteUrl}</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send team invite email: ${error.message}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Phase 3.6 / Plan 03 — Overdue task pressure emails ─────────────────────
//
// Thin wrappers over Resend that render the three plain-text templates from
// `prompts.ts`. Side effects only — no decision logic. Each function is
// fire-and-forget (logs on failure, never throws), so the sweep loop keeps
// processing other tasks if Resend hiccups on one address.

function fireAndForgetSend(args: {
  to: string;
  subject: string;
  body: string;
  context: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.debug(`skipping ${args.context} email — RESEND_API_KEY not set`);
    return Promise.resolve();
  }
  const resend = new Resend(apiKey);
  return resend.emails
    .send({
      from: FROM_ADDRESS,
      to: args.to,
      subject: args.subject,
      // Plain text → keeps the PM tone honest. Resend accepts `text` for
      // text/plain bodies; no HTML escaping concerns.
      text: args.body,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn(`${args.context} email failed`, { to: args.to, err: error.message });
      }
    })
    .catch((err: unknown) => {
      logger.warn(`${args.context} email threw`, {
        to: args.to,
        err: err instanceof Error ? err.message : String(err),
      });
    });
}

export async function sendOverdueNudge(input: {
  to: string;
  taskTitle: string;
  daysOverdue: number;
  taskUrl: string;
}): Promise<void> {
  const { subject, body } = OVERDUE_NUDGE_TEMPLATE(input);
  await fireAndForgetSend({ to: input.to, subject, body, context: 'overdue_nudge' });
}

export async function sendOverdueEscalation(input: {
  to: string;
  assigneeName: string;
  taskTitle: string;
  daysOverdue: number;
  taskUrl: string;
}): Promise<void> {
  const { subject, body } = OVERDUE_ESCALATE_TEMPLATE(input);
  await fireAndForgetSend({ to: input.to, subject, body, context: 'overdue_escalate' });
}

// Spelling note: `sendAutoReschedulNotice` (no trailing 'e') is the contract
// fixed by Plan 03's must-haves — keep it stable so callers don't churn.
export async function sendAutoReschedulNotice(input: {
  to: string;
  taskTitle: string;
  newDate: string;
  taskUrl: string;
}): Promise<void> {
  const { subject, body } = OVERDUE_RESCHEDULE_TEMPLATE(input);
  await fireAndForgetSend({ to: input.to, subject, body, context: 'overdue_reschedule' });
}

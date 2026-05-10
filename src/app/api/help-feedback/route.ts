import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const SUPPORT_EMAIL = 'eneskis1324@gmail.com';
const VALID_CATEGORIES = ['bug', 'idea', 'question', 'other'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

const MAX_MESSAGE_LEN = 4000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { category, message, pageUrl } = (body ?? {}) as {
    category?: string;
    message?: string;
    pageUrl?: string;
  };

  if (!category || !VALID_CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  const trimmed = (message ?? '').trim();
  if (trimmed.length < 3) {
    return NextResponse.json({ error: 'Message is too short' }, { status: 400 });
  }
  if (trimmed.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent') ?? null;
  const userEmail = session.user.email ?? null;
  const userId = session.user.id;

  const { data: row, error: dbErr } = await supabase
    .from('user_feedback')
    .insert({
      user_id: userId,
      user_email: userEmail,
      category,
      message: trimmed,
      page_url: pageUrl ?? null,
      user_agent: userAgent,
    })
    .select('id, created_at')
    .single();

  if (dbErr) {
    logger.error('user_feedback insert failed', { err: dbErr.message });
    return NextResponse.json({ error: 'Could not save feedback' }, { status: 500 });
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subject = `[Recgon ${category}] from ${userEmail ?? userId}`;
      const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 1.5rem;">
          <h2 style="font-size: 1rem; font-weight: 700; margin: 0 0 .75rem;">New Recgon feedback</h2>
          <table style="font-size: .85rem; color: #444; border-collapse: collapse; margin-bottom: 1rem;">
            <tr><td style="padding: 2px 8px 2px 0;"><b>Category</b></td><td>${escapeHtml(category)}</td></tr>
            <tr><td style="padding: 2px 8px 2px 0;"><b>From</b></td><td>${escapeHtml(userEmail ?? userId)}</td></tr>
            ${pageUrl ? `<tr><td style="padding: 2px 8px 2px 0;"><b>Page</b></td><td>${escapeHtml(pageUrl)}</td></tr>` : ''}
            <tr><td style="padding: 2px 8px 2px 0;"><b>Row ID</b></td><td><code>${escapeHtml(row.id)}</code></td></tr>
          </table>
          <div style="font-size: .9rem; color: #111; white-space: pre-wrap; padding: 1rem; background: #f5f5f5; border-radius: 8px; line-height: 1.45;">${escapeHtml(trimmed)}</div>
        </div>
      `;
      await resend.emails.send({
        from: 'Recgon <noreply@recgon.app>',
        to: SUPPORT_EMAIL,
        replyTo: userEmail ?? undefined,
        subject,
        html,
      });
    } catch (err) {
      logger.error('user_feedback email failed (row was saved)', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, id: row.id });
}

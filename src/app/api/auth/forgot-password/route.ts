// Step 1 of password reset: email in → 6-digit code out (via email).
//
// Mirrors send-otp, but for EXISTING accounts. The two flows share the
// `email_verifications` table safely because send-otp only writes codes for
// emails WITHOUT an account, and this route only writes codes for emails
// WITH one — a given email can only ever be in one flow at a time.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getUserByEmail } from '@/lib/userStorage';
import { sendPasswordResetEmail } from '@/lib/email';
import { isRateLimited } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FORGOT_IP_LIMIT = { limit: 5, windowMs: 60 * 60_000 }; // 5/hour per IP
const FORGOT_EMAIL_LIMIT = { limit: 3, windowMs: 60 * 60_000 }; // 3/hour per target email

const ForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (await isRateLimited(`forgot-password:${ip}`, FORGOT_IP_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = ForgotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    const { email } = parsed.data;

    // Per-email cap so an attacker can't flood one inbox from many IPs.
    if (await isRateLimited(`forgot-password-email:${email}`, FORGOT_EMAIL_LIMIT)) {
      return NextResponse.json({ ok: true });
    }

    // Unknown email → same success response (no account enumeration).
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();

    const { error: dbError } = await supabase
      .from('email_verifications')
      .upsert({ email, code, expires_at: expiresAt }, { onConflict: 'email' });

    if (dbError) {
      logger.error('forgot-password db error', dbError);
      return NextResponse.json({ error: 'Unable to send code' }, { status: 500 });
    }

    await sendPasswordResetEmail(email, code);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('forgot-password failed', err);
    return NextResponse.json({ error: 'Unable to send code' }, { status: 500 });
  }
}

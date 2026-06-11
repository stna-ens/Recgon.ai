// Step 2 of password reset: email + code + new password → password updated.
//
// Code verification mirrors the register route (same `email_verifications`
// table, same expiry/cleanup semantics). Also covers GitHub-only accounts:
// proving inbox ownership via the code is enough to let them set a first
// password and unlock credentials sign-in.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getUserByEmail, updateUser } from '@/lib/userStorage';
import { isRateLimited } from '@/lib/rateLimit';
import { validatePassword, PASSWORD_MAX } from '@/lib/passwordPolicy';
import { logger } from '@/lib/logger';

const RESET_LIMIT = { limit: 10, windowMs: 60 * 60_000 }; // 10/hour per IP

const ResetSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  otp: z.string().length(6).regex(/^\d{6}$/),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (await isRateLimited(`reset-password:${ip}`, RESET_LIMIT)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = ResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const { email, otp, password } = parsed.data;

    const policyError = validatePassword(password);
    if (policyError) {
      return NextResponse.json({ error: 'Password does not meet requirements', code: policyError }, { status: 400 });
    }

    const { data: verification, error: verifyErr } = await supabase
      .from('email_verifications')
      .select('code, expires_at')
      .eq('email', email)
      .single();

    if (verifyErr || !verification) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    if (new Date(verification.expires_at) < new Date()) {
      await supabase.from('email_verifications').delete().eq('email', email);
      return NextResponse.json({ error: 'Reset code has expired. Please request a new one.' }, { status: 400 });
    }

    if (verification.code !== otp) {
      return NextResponse.json({ error: 'Incorrect reset code' }, { status: 400 });
    }

    await supabase.from('email_verifications').delete().eq('email', email);

    const user = await getUserByEmail(email);
    if (!user) {
      // Code matched but account vanished — same generic error, no enumeration.
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await updateUser(user.id, { passwordHash });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('reset-password failed', err);
    return NextResponse.json({ error: 'Unable to reset password' }, { status: 500 });
  }
}

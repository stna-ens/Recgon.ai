import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getUserByEmail, createUser } from '@/lib/userStorage';
import { isRateLimited, REGISTER_LIMIT } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { canSelfRegister, requestWaitlistAccess } from '@/lib/waitlist';

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
  nickname: z.string().trim().min(2).max(60),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (await isRateLimited(`register:${ip}`, REGISTER_LIMIT)) {
    return NextResponse.json({ error: 'Too many signup attempts. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const { email, password, nickname, otp } = parsed.data;

    if (!(await canSelfRegister(email))) {
      await requestWaitlistAccess(email, nickname);
      return NextResponse.json({
        error: 'This email is still waiting for approval. We added it to the waitlist.',
        status: 'waitlisted',
      }, { status: 403 });
    }

    // Validate OTP
    const { data: verification, error: verifyErr } = await supabase
      .from('email_verifications')
      .select('code, expires_at')
      .eq('email', email)
      .single();

    if (verifyErr || !verification) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
    }

    if (new Date(verification.expires_at) < new Date()) {
      await supabase.from('email_verifications').delete().eq('email', email);
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    if (verification.code !== otp) {
      return NextResponse.json({ error: 'Incorrect verification code' }, { status: 400 });
    }

    // Clean up used OTP
    await supabase.from('email_verifications').delete().eq('email', email);

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'Unable to create account' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser(email, passwordHash, nickname);

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    logger.error('register failed', err);
    return NextResponse.json({ error: 'Unable to create account' }, { status: 500 });
  }
}

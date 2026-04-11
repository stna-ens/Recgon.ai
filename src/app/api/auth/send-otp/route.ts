import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getUserByEmail } from '@/lib/userStorage';
import { sendOtpEmail } from '@/lib/email';
import { isRateLimited } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SEND_OTP_LIMIT = { limit: 3, windowMs: 60 * 60_000 }; // 3/hour per IP

const SendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (await isRateLimited(`send-otp:${ip}`, SEND_OTP_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = SendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    const { email } = parsed.data;

    if (!email.endsWith('@metu.edu.tr')) {
      return NextResponse.json({ error: 'Only metu.edu.tr email addresses are allowed' }, { status: 403 });
    }

    // Don't reveal if email is already registered
    const existing = await getUserByEmail(email);
    if (existing) {
      // Return success to avoid user enumeration
      return NextResponse.json({ ok: true });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Upsert: one pending verification per email at a time
    const { error: dbError } = await supabase
      .from('email_verifications')
      .upsert({ email, code, expires_at: expiresAt }, { onConflict: 'email' });

    if (dbError) {
      logger.error('send-otp db error', dbError);
      return NextResponse.json({ error: 'Unable to send code' }, { status: 500 });
    }

    await sendOtpEmail(email, code);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('send-otp failed', err);
    return NextResponse.json({ error: 'Unable to send code' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getUserByEmail, createUser } from '@/lib/userStorage';
import { isRateLimited, REGISTER_LIMIT } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
  nickname: z.string().trim().min(2).max(60),
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
    const { email, password, nickname } = parsed.data;

    const existing = await getUserByEmail(email);
    if (existing) {
      // Generic message — do not confirm whether the email is registered.
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

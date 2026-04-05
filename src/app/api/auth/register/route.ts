import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserByEmail, createUser } from '@/lib/userStorage';

export async function POST(request: NextRequest) {
  try {
    const { email, password, nickname } = await request.json();

    if (!email || !password || !nickname) {
      return NextResponse.json({ error: 'Email, password, and nickname are required' }, { status: 400 });
    }

    if (nickname.trim().length < 2) {
      return NextResponse.json({ error: 'Nickname must be at least 2 characters' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser(email, passwordHash, nickname.trim());

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[register]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

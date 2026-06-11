import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { getUserById, getUserByEmail, updateUser } from '@/lib/userStorage';
import { isWaitlistAdminEmail } from '@/lib/waitlist';
import { validatePassword } from '@/lib/passwordPolicy';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getUserById(session.user.id);
  return NextResponse.json({
    avatarUrl: user?.avatarUrl ?? null,
    language: user?.language ?? 'en',
    isWaitlistAdmin: isWaitlistAdminEmail(session.user.email),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { type } = body;

  if (type === 'nickname') {
    const { nickname } = body;
    if (!nickname || nickname.trim().length < 2) {
      return NextResponse.json({ error: 'Nickname must be at least 2 characters' }, { status: 400 });
    }
    await updateUser(session.user.id, { nickname: nickname.trim() });
    return NextResponse.json({ success: true, nickname: nickname.trim() });
  }

  if (type === 'language') {
    const { language } = body;
    if (language !== 'en' && language !== 'tr') {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    }
    await updateUser(session.user.id, { language });
    return NextResponse.json({ success: true, language });
  }

  if (type === 'email') {
    const { newEmail, password } = body;

    if (!newEmail || !password) {
      return NextResponse.json({ error: 'New email and current password are required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const user = await getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.passwordHash) return NextResponse.json({ error: 'OAuth accounts cannot change email here' }, { status: 400 });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });

    const taken = await getUserByEmail(newEmail);
    if (taken && taken.id !== user.id) {
      return NextResponse.json({ error: 'That email is already in use' }, { status: 409 });
    }

    await updateUser(user.id, { email: newEmail });
    return NextResponse.json({ success: true });
  }

  if (type === 'password') {
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      const message = policyError === 'too_short'
        ? 'New password must be at least 8 characters'
        : policyError === 'too_long'
          ? 'New password is too long'
          : 'New password is too repetitive';
      return NextResponse.json({ error: message, code: policyError }, { status: 400 });
    }

    const user = await getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.passwordHash) return NextResponse.json({ error: 'This account uses GitHub sign-in and has no password' }, { status: 400 });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Incorrect current password' }, { status: 403 });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateUser(user.id, { passwordHash });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
}

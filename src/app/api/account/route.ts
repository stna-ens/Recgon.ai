import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { getUserById, getUserByEmail, updateUser } from '@/lib/userStorage';

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
    updateUser(session.user.id, { nickname: nickname.trim() });
    return NextResponse.json({ success: true, nickname: nickname.trim() });
  }

  if (type === 'email') {
    const { newEmail, password } = body;

    if (!newEmail || !password) {
      return NextResponse.json({ error: 'New email and current password are required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const user = getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });

    const taken = getUserByEmail(newEmail);
    if (taken && taken.id !== user.id) {
      return NextResponse.json({ error: 'That email is already in use' }, { status: 409 });
    }

    updateUser(user.id, { email: newEmail });
    return NextResponse.json({ success: true });
  }

  if (type === 'password') {
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }

    const user = getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Incorrect current password' }, { status: 403 });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    updateUser(user.id, { passwordHash });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
}

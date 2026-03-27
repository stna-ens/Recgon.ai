import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserById } from '@/lib/userStorage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = getUserById(session.user.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    connected: !!user.githubAccessToken,
    username: user.githubUsername ?? null,
  });
}

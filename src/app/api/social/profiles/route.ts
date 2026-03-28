import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserById, updateUser } from '@/lib/userStorage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = getUserById(session.user.id);
  return NextResponse.json({ profiles: user?.socialProfiles ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { profiles } = body as { profiles: { platform: string; url: string }[] };

  if (!Array.isArray(profiles)) {
    return NextResponse.json({ error: 'profiles must be an array' }, { status: 400 });
  }

  await updateUser(session.user.id, { socialProfiles: profiles });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await request.json() as { url: string };
  const user = getUserById(session.user.id);
  const profiles = (user?.socialProfiles ?? []).filter((p) => p.url !== url);
  await updateUser(session.user.id, { socialProfiles: profiles });
  return NextResponse.json({ ok: true });
}

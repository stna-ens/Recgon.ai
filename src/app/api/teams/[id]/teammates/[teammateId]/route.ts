import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import { getTeammate, updateTeammate, retireTeammate } from '@/lib/recgon/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; teammateId: string }> },
) {
  const { id: teamId, teammateId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const teammate = await getTeammate(teammateId);
  if (!teammate || teammate.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ teammate });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teammateId: string }> },
) {
  const { id: teamId, teammateId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const teammate = await getTeammate(teammateId);
  if (!teammate || teammate.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json()) as {
    displayName?: string;
    title?: string;
    skills?: string[];
    systemPrompt?: string;
    capacityHours?: number;
    workingHours?: import('@/lib/recgon/types').WorkingHours | null;
    modelPref?: 'gemini' | 'claude' | null;
    status?: 'active' | 'paused' | 'retired';
    avatarColor?: string | null;
  };

  await updateTeammate(teammateId, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; teammateId: string }> },
) {
  const { id: teamId, teammateId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const teammate = await getTeammate(teammateId);
  if (!teammate || teammate.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await retireTeammate(teammateId);
  return NextResponse.json({ success: true });
}

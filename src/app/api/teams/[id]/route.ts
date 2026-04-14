import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTeam, deleteTeam, updateTeamInfo, verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(id, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const team = await getTeam(id);
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  return NextResponse.json({ ...team, role });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, description, avatarColor } = body as { name?: string; description?: string; avatarColor?: string | null };
  if (name === undefined && description === undefined && avatarColor === undefined) {
    return NextResponse.json({ error: 'name, description, or avatarColor is required' }, { status: 400 });
  }

  try {
    await updateTeamInfo(id, { name, description, avatarColor }, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update team';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await deleteTeam(id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete team';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

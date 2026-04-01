import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTeam, deleteTeam, verifyTeamAccess } from '@/lib/teamStorage';

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

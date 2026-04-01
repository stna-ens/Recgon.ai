import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTeamMembers, removeTeamMember, verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(id, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const members = await getTeamMembers(id);
  return NextResponse.json(members);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const callerRole = await verifyTeamAccess(id, session.user.id);
  if (callerRole !== 'owner') return NextResponse.json({ error: 'Only owners can remove members' }, { status: 403 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  try {
    await removeTeamMember(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove member';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

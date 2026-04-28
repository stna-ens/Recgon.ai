import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTeamInvitations, revokeInvitation, verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(id, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const invitations = await getTeamInvitations(id);
  return NextResponse.json(invitations);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { inviteId } = await request.json();
  if (!inviteId) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });

  try {
    await revokeInvitation(inviteId, id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke invitation';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateMemberRole, verifyTeamAccess } from '@/lib/teamStorage';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const callerRole = await verifyTeamAccess(id, session.user.id);
  if (callerRole !== 'owner') return NextResponse.json({ error: 'Only owners can change roles' }, { status: 403 });

  const { role } = await request.json();
  if (!role || !['owner', 'member', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    await updateMemberRole(id, userId, role);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update role';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

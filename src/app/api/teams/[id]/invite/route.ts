import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createInvitation, verifyTeamAccess } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const callerRole = await verifyTeamAccess(id, session.user.id);
  if (callerRole !== 'owner' && callerRole !== 'member') {
    return NextResponse.json({ error: 'Only owners and members can send invitations' }, { status: 403 });
  }

  const { role } = await request.json().catch(() => ({}));
  const inviteRole = role === 'viewer' ? 'viewer' : 'member';

  try {
    const invitation = await createInvitation(id, inviteRole, session.user.id);
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return serverError('POST /api/teams/[id]/invite', error);
  }
}

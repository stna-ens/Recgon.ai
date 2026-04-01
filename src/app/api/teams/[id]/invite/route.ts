import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createInvitation, verifyTeamAccess } from '@/lib/teamStorage';

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

  const { email, role } = await request.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const inviteRole = role === 'viewer' ? 'viewer' : 'member';

  try {
    const invitation = await createInvitation(id, email.trim(), inviteRole, session.user.id);
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invitation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

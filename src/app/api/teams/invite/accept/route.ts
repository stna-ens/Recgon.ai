import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { acceptInvitation, getInvitation } from '@/lib/teamStorage';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await request.json();
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
  }

  try {
    const invitation = await getInvitation(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
    }

    await acceptInvitation(token, session.user.id);
    return NextResponse.json({ success: true, teamId: invitation.teamId, teamName: invitation.teamName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept invitation';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

  const invitation = await getInvitation(token);
  if (!invitation) {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
  }

  return NextResponse.json({
    teamName: invitation.teamName,
    role: invitation.role,
    email: invitation.email,
    expired: new Date(invitation.expiresAt) < new Date(),
  });
}

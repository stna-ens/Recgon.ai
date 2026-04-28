import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { transferAnalyticsConfig } from '@/lib/analyticsStorage';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const direction = body?.direction;
  const teamId = body?.teamId;

  if (direction !== 'to_team' && direction !== 'to_personal') {
    return NextResponse.json({ error: 'direction must be "to_team" or "to_personal"' }, { status: 400 });
  }
  if (!teamId || typeof teamId !== 'string') {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }

  // Both directions require the caller to be a current owner of the team in question.
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can switch analytics scope' }, { status: 403 });
  }

  const result = await transferAnalyticsConfig(direction, session.user.id, teamId);

  if (result === 'source_missing') {
    return NextResponse.json({ error: 'No analytics connection to move' }, { status: 404 });
  }
  if (result === 'target_exists') {
    return NextResponse.json(
      { error: 'The target scope already has a connection. Disconnect it first, then move.' },
      { status: 409 },
    );
  }
  if (result === 'forbidden') {
    return NextResponse.json(
      { error: 'Only the user who originally connected the team analytics can pull it back to personal.' },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}

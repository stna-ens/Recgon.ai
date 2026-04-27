import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { proposeRoster } from '@/lib/recgon/rosterProposer';

// One-shot: ask Recgon to propose a tailored AI roster based on the team's
// projects. Saves the proposal to recgon_state.roster_proposal so the UI
// can show it persistently until the user accepts or dismisses it.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const { proposal } = await proposeRoster(teamId);
    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Proposal failed' },
      { status: 500 },
    );
  }
}

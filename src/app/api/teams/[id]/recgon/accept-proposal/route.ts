import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { getRecgonState, createTeammate, saveRosterProposal } from '@/lib/recgon/storage';

// Materialise a roster proposal — accept all (default) or a subset by index.
// After insertion, the proposal is cleared from recgon_state so the UI
// stops surfacing it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  let acceptedIndices: number[] | null = null;
  try {
    const body = (await request.json()) as { indices?: number[] };
    if (Array.isArray(body.indices)) acceptedIndices = body.indices;
  } catch {
    /* no body — accept all */
  }

  const state = await getRecgonState(teamId);
  const proposal = state.rosterProposal;
  if (!proposal || proposal.teammates.length === 0) {
    return NextResponse.json({ error: 'No active proposal to accept' }, { status: 400 });
  }

  const toCreate = acceptedIndices
    ? acceptedIndices.filter((i) => i >= 0 && i < proposal.teammates.length).map((i) => proposal.teammates[i])
    : proposal.teammates;

  const created = [];
  for (const p of toCreate) {
    try {
      const teammate = await createTeammate({
        teamId,
        kind: 'ai',
        displayName: p.displayName,
        title: p.title || p.displayName,
        skills: p.skills,
        systemPrompt: p.systemPrompt,
        capacityHours: p.capacityHours,
      });
      created.push(teammate);
    } catch {
      /* skip — likely a unique constraint or transient supabase error */
    }
  }

  // Clear the proposal so the UI stops nagging.
  await saveRosterProposal(teamId, null);

  return NextResponse.json({ created: created.length, teammates: created });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  await saveRosterProposal(teamId, null);
  return NextResponse.json({ success: true });
}

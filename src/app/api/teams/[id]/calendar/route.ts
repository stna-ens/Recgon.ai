import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { listTeammatesWithStats, listTasks } from '@/lib/recgon/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') ?? undefined;

  const [teammates, tasks] = await Promise.all([
    listTeammatesWithStats(teamId),
    listTasks(teamId, { projectId }),
  ]);

  // CR-01: strip personalized columns at the route boundary. Team
  // calendar shows all teammates' tasks side-by-side; personalized text
  // intended for one teammate must never appear in another's view.
  const sanitizedTasks = tasks.map((t) => {
    const { personalizedDescription: _pd, personalizedDescriptionForUserId: _pdfu, ...rest } = t;
    void _pd;
    void _pdfu;
    return rest;
  });
  return NextResponse.json({ teammates, tasks: sanitizedTasks });
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const projects = await getAllProjects(teamId, session.user.id);
  const history = projects.flatMap((p) =>
    (p.feedbackAnalyses ?? []).map((a) => ({
      ...a,
      projectId: p.id,
      projectName: p.name,
    }))
  );

  // Sort newest first
  history.sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());

  return NextResponse.json(history);
}

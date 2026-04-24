import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { serverError } from '@/lib/apiError';
import { discoverProjectSources } from '@/lib/feedbackWorkspace';
import { getProject } from '@/lib/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, teamId } = body as { projectId?: string; teamId?: string };

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    const role = await verifyTeamAccess(teamId, session.user.id);
    if (!role) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const project = await getProject(projectId, teamId, session.user.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const candidates = await discoverProjectSources(project);

    return NextResponse.json({
      candidates,
      count: candidates.length,
    });
  } catch (error) {
    return serverError('POST /api/feedback/sources/discover', error);
  }
}

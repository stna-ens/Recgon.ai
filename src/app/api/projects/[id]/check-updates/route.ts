import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/storage';
import { getLatestCommit } from '@/lib/githubFetcher';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const project = await getProject(id, teamId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (!project.isGithub || !project.githubUrl) {
    return NextResponse.json({ hasUpdates: false });
  }

  const commit = await getLatestCommit(project.githubUrl);
  if (!commit) return NextResponse.json({ hasUpdates: false });

  const hasUpdates =
    !!project.lastAnalyzedCommitSha &&
    commit.sha !== project.lastAnalyzedCommitSha;

  return NextResponse.json({ hasUpdates, commit });
}

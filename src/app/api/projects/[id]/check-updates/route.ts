import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/storage';
import { getLatestCommit } from '@/lib/githubFetcher';
import { auth } from '@/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = getProject(params.id, session.user.id);
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

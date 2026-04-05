import { NextRequest, NextResponse } from 'next/server';
import { getProject, deleteProject, saveProject } from '@/lib/storage';
import { cloneGitHubRepo } from '@/lib/githubFetcher';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';

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
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const project = await getProject(id, teamId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  await deleteProject(id, teamId);
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const body = await request.json();
  const { description, path: rawPath } = body;

  if (!description && !rawPath) {
    return NextResponse.json({ error: 'description or path is required' }, { status: 400 });
  }

  const project = await getProject(id, teamId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (rawPath) {
    let actualPath = rawPath as string;
    let isGithub = false;
    if (actualPath.startsWith('https://github.com/')) {
      actualPath = await cloneGitHubRepo(actualPath, id);
      isGithub = true;
    }
    project.path = actualPath;
    project.sourceType = isGithub ? 'github' : 'codebase';
    project.isGithub = isGithub;
    if (isGithub) project.githubUrl = rawPath as string;
  }

  if (description) {
    project.description = description as string;
  }

  await saveProject(project);
  return NextResponse.json({ success: true });
}

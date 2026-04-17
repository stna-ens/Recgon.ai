import { NextRequest, NextResponse } from 'next/server';
import { getProject, deleteProject, saveProject, updateProjectShared } from '@/lib/storage';
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

  const project = await getProject(id, teamId, session.user.id);
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

  const project = await getProject(id, teamId, session.user.id);
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
  const { description, path: rawPath, isShared } = body;

  if (description === undefined && rawPath === undefined && isShared === undefined) {
    return NextResponse.json({ error: 'description, path, or isShared is required' }, { status: 400 });
  }

  const project = await getProject(id, teamId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Privacy toggle — only the creator may change it.
  if (typeof isShared === 'boolean') {
    if (project.createdBy !== session.user.id) {
      return NextResponse.json({ error: 'Only the project creator can change privacy' }, { status: 403 });
    }
    const ok = await updateProjectShared(id, teamId, session.user.id, isShared);
    if (!ok) return NextResponse.json({ error: 'Failed to update privacy' }, { status: 500 });
  }

  if (rawPath) {
    // Only GitHub URLs are supported — local paths were removed.
    if (!rawPath.startsWith('https://github.com/')) {
      return NextResponse.json(
        { error: 'Only GitHub URLs are supported. Use the "Import from GitHub" flow.' },
        { status: 400 },
      );
    }
    const actualPath = await cloneGitHubRepo(rawPath, id);
    project.path = actualPath;
    project.sourceType = 'github';
    project.isGithub = true;
    project.githubUrl = rawPath as string;
  }

  if (description) {
    project.description = description as string;
  }

  if (rawPath || description) {
    await saveProject(project);
  }
  return NextResponse.json({ success: true });
}

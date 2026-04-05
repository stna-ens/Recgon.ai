import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, saveProject, generateId } from '@/lib/storage';
import { cloneGitHubRepo } from '@/lib/githubFetcher';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const projects = await getAllProjects(teamId);
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, path: rawPath, description, teamId } = body;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!rawPath && !description) {
      return NextResponse.json({ error: 'Path or description is required' }, { status: 400 });
    }
    if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

    const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
    if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const projectId = generateId();
    const createdAt = new Date().toISOString();

    let project;

    if (description && !rawPath) {
      project = {
        id: projectId,
        teamId,
        createdBy: session.user.id,
        name,
        sourceType: 'description' as const,
        description,
        createdAt,
      };
    } else {
      let actualPath = rawPath;
      let isGithub = false;

      if (rawPath.startsWith('https://github.com/')) {
        actualPath = await cloneGitHubRepo(rawPath, projectId);
        isGithub = true;
      }

      project = {
        id: projectId,
        teamId,
        createdBy: session.user.id,
        name,
        path: actualPath,
        sourceType: (isGithub ? 'github' : 'codebase') as 'github' | 'codebase',
        isGithub,
        ...(isGithub && { githubUrl: rawPath }),
        createdAt,
      };
    }

    await saveProject(project);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

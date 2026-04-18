import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, saveProject, generateId } from '@/lib/storage';
import { cloneGitHubRepo } from '@/lib/githubFetcher';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import { getUserById } from '@/lib/userStorage';
import { serverError } from '@/lib/apiError';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const projects = await getAllProjects(teamId, session.user.id);
  return NextResponse.json(projects, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, path: rawPath, description, teamId } = body;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!rawPath && !description) {
      return NextResponse.json({ error: 'A GitHub URL or description is required' }, { status: 400 });
    }
    if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

    // Local codebase paths are no longer supported — the app runs in a hosted
    // environment and cannot read a user's filesystem. Only GitHub URLs and
    // plain-text descriptions are accepted.
    if (rawPath && !rawPath.startsWith('https://github.com/')) {
      return NextResponse.json(
        { error: 'Only GitHub URLs are supported. Use the "Import from GitHub" flow or describe your idea instead.' },
        { status: 400 },
      );
    }

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
      // rawPath is guaranteed to be a GitHub URL by the check above
      const user = await getUserById(session.user.id);
      const token = user?.githubAccessToken ?? undefined;
      const actualPath = await cloneGitHubRepo(rawPath, projectId, token);

      project = {
        id: projectId,
        teamId,
        createdBy: session.user.id,
        name,
        path: actualPath,
        sourceType: 'github' as const,
        isGithub: true,
        githubUrl: rawPath,
        createdAt,
      };
    }

    await saveProject(project);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    // GitHub import errors have user-friendly messages — surface them directly.
    const msg = error instanceof Error ? error.message : '';
    if (msg.startsWith('Repository') || msg.startsWith('GitHub') || msg.startsWith('Invalid GitHub') || msg.startsWith('Could not parse') || msg.startsWith('Failed to download')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return serverError('POST /api/projects', error);
  }
}

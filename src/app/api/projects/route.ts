import { NextRequest, NextResponse } from 'next/server';
import { getAllProjects, saveProject, generateId } from '@/lib/storage';
import { cloneGitHubRepo } from '@/lib/githubFetcher';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = getAllProjects(session.user.id);
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, path: rawPath } = body;

    if (!name || !rawPath) {
      return NextResponse.json(
        { error: 'Name and path/URL are required' },
        { status: 400 }
      );
    }

    const projectId = generateId();
    let actualPath = rawPath;
    let isGithub = false;

    if (rawPath.startsWith('https://github.com/')) {
      actualPath = await cloneGitHubRepo(rawPath, projectId);
      isGithub = true;
    }

    const project = {
      id: projectId,
      userId: session.user.id,
      name,
      path: actualPath,
      isGithub,
      ...(isGithub && { githubUrl: rawPath }),
      createdAt: new Date().toISOString(),
    };

    saveProject(project);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

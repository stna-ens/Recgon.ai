import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProject, saveSocialProfilesToProject } from '@/lib/storage';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  const project = getProject(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ profiles: project.socialProfiles ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { projectId, profiles } = body as { projectId: string; profiles: { platform: string; url: string }[] };

  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (!Array.isArray(profiles)) return NextResponse.json({ error: 'profiles must be an array' }, { status: 400 });

  const saved = await saveSocialProfilesToProject(projectId, profiles, session.user.id);
  if (!saved) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, url } = await request.json() as { projectId: string; url: string };
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  const project = getProject(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const profiles = (project.socialProfiles ?? []).filter((p) => p.url !== url);
  const saved = await saveSocialProfilesToProject(projectId, profiles, session.user.id);
  if (!saved) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

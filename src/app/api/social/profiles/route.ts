import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProject, saveSocialProfilesToProject } from '@/lib/storage';
import { dedupeSourceProfiles } from '@/lib/sourceProfiles';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId');
  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const project = await getProject(projectId, teamId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ profiles: project.socialProfiles ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { projectId, profiles, teamId } = body as { projectId: string; profiles: { platform: string; url: string }[]; teamId: string };

  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  if (!Array.isArray(profiles)) return NextResponse.json({ error: 'profiles must be an array' }, { status: 400 });

  const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const project = await getProject(projectId, teamId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const normalizedProfiles = dedupeSourceProfiles(profiles);
  if (profiles.length > 0 && normalizedProfiles.length === 0) {
    return NextResponse.json({ error: 'At least one valid public URL is required' }, { status: 400 });
  }

  const saved = await saveSocialProfilesToProject(projectId, normalizedProfiles, teamId);
  if (!saved) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, url, teamId } = await request.json() as { projectId: string; url: string; teamId: string };
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const project = await getProject(projectId, teamId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const filteredProfiles = (project.socialProfiles ?? []).filter((p) => p.url !== url);
  const saved = await saveSocialProfilesToProject(projectId, filteredProfiles, teamId);
  if (!saved) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

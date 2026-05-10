import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProject, getProjectTeamId, autoDetectLogo } from '@/lib/storage';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = await getProjectTeamId(id);
  if (!teamId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const project = await getProject(id, teamId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Bypass the helper's "skip if logo set" guard so this endpoint always re-runs detection.
  project.logoUrl = undefined;
  await autoDetectLogo(project);

  const updated = await getProject(id, teamId, session.user.id);
  return NextResponse.json({ logoUrl: updated?.logoUrl ?? null });
}

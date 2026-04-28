import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getProject } from '@/lib/storage';
import { deleteIntegration } from '@/lib/integrationStorage';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { projectId?: string; teamId?: string };
  try {
    body = (await request.json()) as { projectId?: string; teamId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { projectId, teamId } = body;
  if (!projectId || !teamId) {
    return NextResponse.json({ error: 'projectId and teamId required' }, { status: 400 });
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const project = await getProject(projectId, teamId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  await deleteIntegration(projectId, 'instagram');
  return NextResponse.json({ success: true });
}

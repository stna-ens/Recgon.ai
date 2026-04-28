import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getProject } from '@/lib/storage';
import { listIntegrations } from '@/lib/integrationStorage';

// Lightweight status endpoint for the project page UI: returns which
// integrations (instagram, etc.) are connected for this project. Does not
// expose tokens.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const teamId = url.searchParams.get('teamId');
  if (!projectId || !teamId) {
    return NextResponse.json({ error: 'projectId and teamId required' }, { status: 400 });
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const project = await getProject(projectId, teamId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const integrations = await listIntegrations(projectId);
  return NextResponse.json({
    integrations: integrations.map((i) => ({
      provider: i.provider,
      accountHandle: i.accountHandle,
      connectedAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
  });
}

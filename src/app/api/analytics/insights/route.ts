import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { serverError } from '@/lib/apiError';
import { listAnalyticsInsights } from '@/lib/analyticsInsightsStorage';
import { getProjectTeamId } from '@/lib/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const teamId = req.nextUrl.searchParams.get('teamId');
    const projectId = req.nextUrl.searchParams.get('projectId') ?? undefined;
    const propertyId = req.nextUrl.searchParams.get('propertyId') ?? undefined;

    if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

    const role = await verifyTeamAccess(teamId, session.user.id);
    if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    if (projectId) {
      const owningTeamId = await getProjectTeamId(projectId);
      if (owningTeamId !== teamId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const insights = await listAnalyticsInsights({ teamId, projectId, propertyId, limit: 10 });
    return NextResponse.json({ insights });
  } catch (err) {
    return serverError('GET /api/analytics/insights', err);
  }
}

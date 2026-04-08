import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalyticsConfig } from '@/lib/analyticsStorage';
import { fetchAnalyticsData } from '@/lib/analyticsEngine';
import { getProject } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAnalyticsConfig(session.user.id);
  if (config?.authMethod !== 'oauth' && !config?.serviceAccountJson) {
    return NextResponse.json({ error: 'Google Analytics is not configured' }, { status: 400 });
  }

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10) || 30;
  const projectId = req.nextUrl.searchParams.get('projectId');
  const teamId = req.headers.get('x-team-id') ?? undefined;

  let propertyId: string | undefined = config?.propertyId;
  if (projectId) {
    const project = await getProject(projectId, teamId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    propertyId = project.analyticsPropertyId || config?.propertyId;
  }

  if (!propertyId || !/^\d+$/.test(propertyId)) {
    return NextResponse.json({ error: 'Google Analytics is not configured — set a valid numeric property ID' }, { status: 400 });
  }

  try {
    const authOptions = config!.authMethod === 'oauth' && config!.oauth
      ? { oauth: config!.oauth, userId: session.user.id }
      : { serviceAccountJson: config!.serviceAccountJson };

    const data = await fetchAnalyticsData(propertyId, authOptions, days);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch analytics data';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

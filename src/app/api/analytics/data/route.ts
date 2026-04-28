import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalyticsConfig, type ConfigScope } from '@/lib/analyticsStorage';
import { fetchAnalyticsData } from '@/lib/analyticsEngine';
import { getProject, getProjectTeamId } from '@/lib/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10) || 30;
  const projectId = req.nextUrl.searchParams.get('projectId');
  const scopeParam = req.nextUrl.searchParams.get('scope');
  const scopeTeamId = req.nextUrl.searchParams.get('teamId');
  const directPropertyId = req.nextUrl.searchParams.get('propertyId');

  let scope: ConfigScope;
  let propertyId: string | undefined;

  if (projectId) {
    const teamId = await getProjectTeamId(projectId);
    if (!teamId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const role = await verifyTeamAccess(teamId, session.user.id);
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const project = await getProject(projectId, teamId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    scope = { kind: 'team', teamId };
    const teamConfig = await getAnalyticsConfig(scope);
    propertyId = project.analyticsPropertyId || teamConfig?.propertyId;
  } else if (scopeParam === 'personal') {
    scope = { kind: 'personal', userId: session.user.id };
    const personalConfig = await getAnalyticsConfig(scope);
    propertyId = directPropertyId ?? personalConfig?.propertyId;
  } else if (scopeParam === 'team' && scopeTeamId) {
    const role = await verifyTeamAccess(scopeTeamId, session.user.id);
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    scope = { kind: 'team', teamId: scopeTeamId };
    const teamConfig = await getAnalyticsConfig(scope);
    propertyId = directPropertyId ?? teamConfig?.propertyId;
  } else {
    return NextResponse.json({ error: 'Missing scope or projectId' }, { status: 400 });
  }

  const config = await getAnalyticsConfig(scope);
  if (config?.authMethod !== 'oauth' && !config?.serviceAccountJson) {
    return NextResponse.json({ error: 'Google Analytics is not configured' }, { status: 400 });
  }

  if (!propertyId || !/^\d+$/.test(propertyId)) {
    return NextResponse.json({ error: 'Google Analytics is not configured — set a valid numeric property ID' }, { status: 400 });
  }

  try {
    const authOptions = config.authMethod === 'oauth' && config.oauth
      ? { oauth: config.oauth, scope }
      : { serviceAccountJson: config.serviceAccountJson };

    const data = await fetchAnalyticsData(propertyId, authOptions, days);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch analytics data';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

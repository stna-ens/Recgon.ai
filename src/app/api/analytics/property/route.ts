import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalyticsConfig, setAnalyticsConfig, setAnalyticsPropertyId, disconnectAnalytics } from '@/lib/analyticsStorage';
import { updateProjectAnalyticsProperty, getProjectTeamId } from '@/lib/storage';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { resolveScope } from '@/lib/analyticsScope';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveScope(req.nextUrl.searchParams, session.user.id);
  if (!resolved.ok) return resolved.response;

  const config = await getAnalyticsConfig(resolved.scope);
  return NextResponse.json({
    propertyId: config?.propertyId ?? null,
    hasCredentials: !!(config?.serviceAccountJson || config?.oauth),
    authMethod: config?.authMethod ?? null,
    ownerUserId: config?.ownerUserId ?? null,
    oauthConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Handle linking a GA4 property to a specific project (project-level, unchanged)
  if (body.type === 'set_project_property') {
    const { projectId, propertyId } = body;
    if (!projectId || typeof projectId !== 'string')
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const trimmed = typeof propertyId === 'string' ? propertyId.trim() : '';
    if (trimmed && !/^\d+$/.test(trimmed))
      return NextResponse.json({ error: 'Invalid property ID — must be numeric (e.g. 123456789)' }, { status: 400 });

    const teamId = await getProjectTeamId(projectId);
    if (!teamId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const canWrite = await verifyTeamWriteAccess(teamId, session.user.id);
    if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ok = await updateProjectAnalyticsProperty(projectId, trimmed || null, teamId);
    if (!ok) return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // For analytics_configs writes, scope comes from query params
  const resolved = await resolveScope(req.nextUrl.searchParams, session.user.id, { requireOwnerForTeam: true });
  if (!resolved.ok) return resolved.response;

  if (body.type === 'set_property_id') {
    const { propertyId } = body;
    if (!propertyId || typeof propertyId !== 'string' || !/^\d+$/.test(propertyId.trim())) {
      return NextResponse.json({ error: 'Invalid property ID — must be numeric (e.g. 123456789)' }, { status: 400 });
    }
    await setAnalyticsPropertyId(resolved.scope, propertyId.trim());
    return NextResponse.json({ ok: true });
  }

  // Service account setup (legacy)
  const { propertyId, serviceAccountJson } = body;

  if (!propertyId || typeof propertyId !== 'string' || !/^\d+$/.test(propertyId.trim())) {
    return NextResponse.json({ error: 'Invalid property ID — must be numeric (e.g. 123456789)' }, { status: 400 });
  }

  if (!serviceAccountJson || typeof serviceAccountJson !== 'string') {
    return NextResponse.json({ error: 'Service account JSON is required' }, { status: 400 });
  }

  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (!parsed.client_email || !parsed.private_key) {
      return NextResponse.json({ error: 'Invalid service account JSON — missing client_email or private_key' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON — paste the full contents of your service account key file' }, { status: 400 });
  }

  await setAnalyticsConfig(resolved.scope, session.user.id, propertyId.trim(), serviceAccountJson);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveScope(req.nextUrl.searchParams, session.user.id, { requireOwnerForTeam: true });
  if (!resolved.ok) return resolved.response;

  await disconnectAnalytics(resolved.scope);
  return NextResponse.json({ ok: true });
}

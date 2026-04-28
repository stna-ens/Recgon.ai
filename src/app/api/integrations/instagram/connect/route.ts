import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getProject } from '@/lib/storage';
import { buildInstagramAuthUrl, getMetaAppConfig } from '@/lib/instagramGraph';

// Kick off Meta OAuth. The caller passes ?projectId=...&teamId=... and we
// redirect them to the Meta auth dialog with a signed `state` so the callback
// can attribute the resulting token to the right project.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const teamId = url.searchParams.get('teamId');
  if (!projectId || !teamId) {
    return NextResponse.json({ error: 'projectId and teamId are required' }, { status: 400 });
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const project = await getProject(projectId, teamId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const cfg = getMetaAppConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'Instagram integration not configured. Set META_APP_ID, META_APP_SECRET, and META_REDIRECT_URI.' },
      { status: 500 },
    );
  }

  // Sign state so the callback can trust it without round-tripping a session.
  const secret = process.env.AUTH_SECRET ?? cfg.appSecret;
  const payload = JSON.stringify({ projectId, teamId, userId: session.user.id, ts: Date.now() });
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');

  const authUrl = buildInstagramAuthUrl(state);
  if (!authUrl) {
    return NextResponse.json({ error: 'Failed to build Meta auth URL' }, { status: 500 });
  }
  return NextResponse.redirect(authUrl);
}

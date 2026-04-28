import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  exchangeCodeForToken,
  exchangeShortLivedForLongLived,
  findInstagramBusinessAccount,
  getMetaAppConfig,
} from '@/lib/instagramGraph';
import { upsertIntegration } from '@/lib/integrationStorage';
import { logger } from '@/lib/logger';

// Meta OAuth callback. Exchanges code → short-lived → long-lived token,
// finds the user's IG Business Account, stores it on project_integrations,
// then redirects back to /projects/<id>?ig=connected.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) {
    return NextResponse.redirect(new URL(`/projects?ig=error&reason=${encodeURIComponent(error)}`, request.url));
  }
  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const cfg = getMetaAppConfig();
  if (!cfg) return NextResponse.json({ error: 'Meta app not configured' }, { status: 500 });

  // Verify state.
  let projectId: string;
  let teamId: string;
  try {
    const { payload, sig } = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
    const secret = process.env.AUTH_SECRET ?? cfg.appSecret;
    const expected = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new Error('bad signature');
    }
    const parsed = JSON.parse(payload) as { projectId: string; teamId: string; userId: string; ts: number };
    if (parsed.userId !== session.user.id) throw new Error('userId mismatch');
    if (Date.now() - parsed.ts > 10 * 60 * 1000) throw new Error('state expired');
    projectId = parsed.projectId;
    teamId = parsed.teamId;
  } catch (err) {
    logger.warn('IG callback: state validation failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Exchange short → long-lived → find IG Business Account.
  const shortLived = await exchangeCodeForToken(code);
  if (!shortLived) return NextResponse.redirect(new URL(`/projects/${projectId}?ig=error&reason=token_exchange`, request.url));
  const longLived = await exchangeShortLivedForLongLived(shortLived.accessToken);
  if (!longLived) return NextResponse.redirect(new URL(`/projects/${projectId}?ig=error&reason=long_lived`, request.url));
  const ig = await findInstagramBusinessAccount(longLived.accessToken);
  if (!ig) return NextResponse.redirect(new URL(`/projects/${projectId}?ig=error&reason=no_ig_account`, request.url));

  await upsertIntegration({
    projectId,
    teamId,
    provider: 'instagram',
    accountId: ig.igAccountId,
    accountHandle: ig.igHandle,
    accessToken: longLived.accessToken,
    expiresAt: new Date(Date.now() + longLived.expiresIn * 1000).toISOString(),
    metadata: { pageId: ig.pageId, pageName: ig.pageName },
    connectedBy: session.user.id,
  });

  return NextResponse.redirect(new URL(`/projects/${projectId}?ig=connected&handle=${encodeURIComponent(ig.igHandle)}`, request.url));
}

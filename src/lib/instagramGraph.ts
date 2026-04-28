// Instagram Graph API client.
//
// Uses the long-lived user token + IG Business Account ID stored in
// project_integrations. Provides two operations:
//
//   1. listRecentMedia(igAccountId, token)  — used by the verification source.
//   2. exchangeShortLivedForLongLived(...)  — OAuth callback helper.
//
// Required ENV (set in Vercel):
//   META_APP_ID         — your Meta app ID
//   META_APP_SECRET     — your Meta app secret
//   META_REDIRECT_URI   — must match what's registered in the Meta dashboard,
//                         e.g. https://recgon.app/api/integrations/instagram/callback

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';
const FB_OAUTH_BASE = 'https://www.facebook.com/v22.0/dialog/oauth';

export type IGMedia = {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
  media_url?: string;
  permalink: string;
  timestamp: string;
  thumbnail_url?: string;
};

export function getMetaAppConfig(): { appId: string; appSecret: string; redirectUri: string } | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) return null;
  return { appId, appSecret, redirectUri };
}

export function buildInstagramAuthUrl(state: string): string | null {
  const cfg = getMetaAppConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    state,
    scope: [
      'instagram_basic',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(','),
  });
  return `${FB_OAUTH_BASE}?${params.toString()}`;
}

// Step 1 of the OAuth dance after Meta redirects back with ?code=...
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresIn?: number;
} | null> {
  const cfg = getMetaAppConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// Step 2: short-lived → long-lived (~60 days). Required so the source still
// works when the cron fires next week.
export async function exchangeShortLivedForLongLived(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
} | null> {
  const cfg = getMetaAppConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 60 * 24 * 60 * 60 };
}

// After we have the long-lived token, we need to find the IG Business Account
// linked to a Facebook Page the user manages.
export async function findInstagramBusinessAccount(longLivedToken: string): Promise<{
  igAccountId: string;
  igHandle: string;
  pageId: string;
  pageName: string;
} | null> {
  // List Pages
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedToken)}`,
  );
  if (!pagesRes.ok) return null;
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
  };
  for (const page of pagesData.data ?? []) {
    // Per-page query for connected IG account
    const igRes = await fetch(
      `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`,
    );
    if (!igRes.ok) continue;
    const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
    const igAccountId = igData.instagram_business_account?.id;
    if (!igAccountId) continue;

    // Fetch the IG handle
    const profRes = await fetch(
      `${GRAPH_BASE}/${igAccountId}?fields=username&access_token=${encodeURIComponent(page.access_token)}`,
    );
    if (!profRes.ok) continue;
    const profData = (await profRes.json()) as { username?: string };
    return {
      igAccountId,
      igHandle: profData.username ?? '',
      pageId: page.id,
      pageName: page.name,
    };
  }
  return null;
}

// List recent media for the connected IG Business Account. Used by the
// verification source to find a Reel/post that matches a task.
export async function listRecentMedia(
  igAccountId: string,
  accessToken: string,
  limit = 25,
): Promise<IGMedia[]> {
  const fields = 'id,caption,media_type,media_url,permalink,timestamp,thumbnail_url';
  const url = `${GRAPH_BASE}/${igAccountId}/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: IGMedia[] };
  return data.data ?? [];
}

// Parse an IG URL → media shortcode. Returns null if the URL doesn't match
// known IG patterns (https://www.instagram.com/p/<code>/, /reel/<code>/, etc.)
export function parseInstagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

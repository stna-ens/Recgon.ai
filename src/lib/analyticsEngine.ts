import { BetaAnalyticsDataClient, protos } from '@google-analytics/data';
import { OAuth2Client } from 'google-auth-library';
import { updateOAuthTokens, type OAuthTokens, type ConfigScope } from './analyticsStorage';

export interface OverviewMetrics {
  sessions: number;
  activeUsers: number;
  newUsers: number;
  screenPageViews: number;
  bounceRate: number;
  averageSessionDuration: number;
}

export interface TrendPoint {
  date: string;
  sessions: number;
  users: number;
  pageViews: number;
}

export interface ChannelData {
  channel: string;
  sessions: number;
  percentage: number;
}

export interface PageData {
  page: string;
  views: number;
  sessions: number;
}

export interface DeviceData {
  device: string;
  sessions: number;
  percentage: number;
}

export interface CountryData {
  country: string;
  sessions: number;
}

export interface AnalyticsData {
  overview: OverviewMetrics;
  trend: TrendPoint[];
  channels: ChannelData[];
  topPages: PageData[];
  devices: DeviceData[];
  countries: CountryData[];
  dateRange: string;
  propertyId: string;
  fetchedAt: string;
}

function num(val: string | null | undefined): number {
  return parseFloat(val ?? '0') || 0;
}

async function refreshOAuthToken(refreshToken: string, scope: ConfigScope): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error('Failed to refresh Google OAuth token. Please reconnect your Google account.');
  }

  const newTokens: Partial<OAuthTokens> = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  if (data.refresh_token) newTokens.refreshToken = data.refresh_token;
  await updateOAuthTokens(scope, newTokens);

  return data.access_token;
}

/**
 * True when a GA4 API error looks like an expired/rejected access token. The
 * cached token is valid for an hour; Google can reject it earlier (revocation,
 * clock skew, early rotation), and the 5-min refresh buffer can miss that. When
 * this is the cause we refresh once and retry — instead of surfacing a scary
 * auth error that reads (to a user) like "analytics isn't connected".
 */
function isOAuthAuthError(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string } | null;
  const code = e?.code;
  if (code === 16 || code === 401 || code === '401' || code === 'UNAUTHENTICATED') return true;
  const msg = (e?.message ?? '').toLowerCase();
  return (
    msg.includes('unauthenticated') ||
    msg.includes('invalid authentication') ||
    msg.includes('invalid credentials') ||
    msg.includes('access token') ||
    msg.includes('401')
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * True when a GA4 error is a transient blip worth retrying — rate limits,
 * Google 5xx, network resets, gRPC UNAVAILABLE/DEADLINE/RESOURCE_EXHAUSTED.
 * These are the "works on the next try" failures we never want to surface.
 */
function isTransientError(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string } | null;
  const code = e?.code;
  // gRPC: 4=DEADLINE_EXCEEDED, 8=RESOURCE_EXHAUSTED, 13=INTERNAL, 14=UNAVAILABLE
  if (code === 4 || code === 8 || code === 13 || code === 14) return true;
  if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('deadline') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('internal error') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  );
}

interface AuthOptions {
  serviceAccountJson?: string;
  oauth?: OAuthTokens;
  scope?: ConfigScope;
}

export async function fetchAnalyticsData(
  propertyId: string,
  authOptions: string | AuthOptions,
  days = 30,
): Promise<AnalyticsData> {
  let client: BetaAnalyticsDataClient;
  // When set, the OAuth token can be force-refreshed and the client rebuilt
  // so a mid-request auth rejection self-heals with one retry.
  let oauthRetry: { refreshToken: string; scope: ConfigScope } | null = null;

  // BetaAnalyticsDataClient's `authClient` parameter is typed against an older
  // google-auth-library AuthClient than the one OAuth2Client extends here —
  // cast through unknown to bridge the version mismatch.
  type AnalyticsClientOptions = ConstructorParameters<typeof BetaAnalyticsDataClient>[0];
  const buildOAuthClient = (accessToken: string): BetaAnalyticsDataClient => {
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    return new BetaAnalyticsDataClient({
      authClient: oauth2Client as unknown as NonNullable<AnalyticsClientOptions>['authClient'],
    });
  };

  if (typeof authOptions === 'string') {
    // Legacy: service account JSON string
    const credentials = JSON.parse(authOptions);
    client = new BetaAnalyticsDataClient({ credentials });
  } else if (authOptions.oauth) {
    let accessToken = authOptions.oauth.accessToken;

    // Auto-refresh if token is expired or about to expire (5 min buffer)
    if (authOptions.oauth.expiresAt < Date.now() + 5 * 60 * 1000) {
      if (!authOptions.oauth.refreshToken || !authOptions.scope) {
        throw new Error('OAuth token expired. Please reconnect your Google account.');
      }
      accessToken = await refreshOAuthToken(authOptions.oauth.refreshToken, authOptions.scope);
    }
    if (authOptions.oauth.refreshToken && authOptions.scope) {
      oauthRetry = { refreshToken: authOptions.oauth.refreshToken, scope: authOptions.scope };
    }
    client = buildOAuthClient(accessToken);
  } else if (authOptions.serviceAccountJson) {
    const credentials = JSON.parse(authOptions.serviceAccountJson);
    client = new BetaAnalyticsDataClient({ credentials });
  } else {
    throw new Error('No authentication method provided');
  }
  const property = `properties/${propertyId}`;
  const startDate = `${days}daysAgo`;

  // Refresh the OAuth token at most once per fetch (shared across the parallel
  // reports), rebuilding the client so every in-flight retry picks up the new
  // token. Resolves false if refresh is impossible/failed (genuinely revoked).
  let refreshOnce: Promise<boolean> | null = null;
  const tryRefresh = (): Promise<boolean> => {
    if (!oauthRetry) return Promise.resolve(false);
    if (!refreshOnce) {
      refreshOnce = refreshOAuthToken(oauthRetry.refreshToken, oauthRetry.scope)
        .then((fresh) => { client = buildOAuthClient(fresh); return true; })
        .catch(() => false);
    }
    return refreshOnce;
  };

  type ReportParams = protos.google.analytics.data.v1beta.IRunReportRequest;
  type ReportResult = [protos.google.analytics.data.v1beta.IRunReportResponse, ...unknown[]];
  const EMPTY_REPORT = [{ rows: [] }] as unknown as ReportResult;

  // Run one report with full resilience: refresh-and-retry on auth rejection,
  // exponential backoff on transient Google API errors. Enrichment reports fail
  // soft to empty so one flaky sub-report can never sink the whole fetch; only
  // the critical overview report throws — and only when truly unrecoverable.
  const resilientReport = async (params: ReportParams, critical: boolean): Promise<ReportResult> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await client.runReport(params);
      } catch (err) {
        lastErr = err;
        if (isOAuthAuthError(err)) {
          if (await tryRefresh()) continue; // retry immediately with fresh token
          break; // refresh failed → unrecoverable
        }
        if (isTransientError(err) && attempt < 4) {
          await sleep(250 * 2 ** attempt); // 250ms · 500 · 1000 · 2000
          continue;
        }
        break;
      }
    }
    if (critical) {
      throw new Error(
        oauthRetry && isOAuthAuthError(lastErr)
          ? 'Google sign-in for analytics expired and could not be refreshed — a team owner can reconnect Google in the Analytics tab.'
          : `Google Analytics is unreachable right now — try again in a moment. (${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
      );
    }
    return EMPTY_REPORT;
  };

  const [overviewResp, trendResp, channelResp, pagesResp, deviceResp, countryResp] = await Promise.all([
    // 1. Overall summary (critical — drives the headline metrics)
    resilientReport({
      property,
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dateRanges: [{ startDate, endDate: 'today' }],
    }, true),

    // 2. Daily trend
    resilientReport({
      property,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
      dateRanges: [{ startDate, endDate: 'today' }],
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
    }, false),

    // 3. Traffic channels
    resilientReport({
      property,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate: 'today' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }, false),

    // 4. Top pages
    resilientReport({
      property,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
      dateRanges: [{ startDate, endDate: 'today' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }, false),

    // 5. Device breakdown
    resilientReport({
      property,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate: 'today' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }, false),

    // 6. Top countries
    resilientReport({
      property,
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate: 'today' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }, false),
  ]);

  // Parse overview
  const overviewRow = overviewResp[0].rows?.[0];
  const overview: OverviewMetrics = {
    sessions: num(overviewRow?.metricValues?.[0]?.value),
    activeUsers: num(overviewRow?.metricValues?.[1]?.value),
    newUsers: num(overviewRow?.metricValues?.[2]?.value),
    screenPageViews: num(overviewRow?.metricValues?.[3]?.value),
    bounceRate: num(overviewRow?.metricValues?.[4]?.value) * 100,
    averageSessionDuration: num(overviewRow?.metricValues?.[5]?.value),
  };

  // Parse trend
  const trend: TrendPoint[] = (trendResp[0].rows ?? []).map((row) => {
    const raw = row.dimensionValues?.[0]?.value ?? '';
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return {
      date,
      sessions: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
      pageViews: num(row.metricValues?.[2]?.value),
    };
  });

  // Parse channels + compute percentages
  const channelRows = channelResp[0].rows ?? [];
  const totalChannelSessions = channelRows.reduce((s, r) => s + num(r.metricValues?.[0]?.value), 0);
  const channels: ChannelData[] = channelRows.map((row) => {
    const sessions = num(row.metricValues?.[0]?.value);
    return {
      channel: row.dimensionValues?.[0]?.value ?? 'Unknown',
      sessions,
      percentage: totalChannelSessions > 0 ? Math.round((sessions / totalChannelSessions) * 100) : 0,
    };
  });

  // Parse top pages
  const topPages: PageData[] = (pagesResp[0].rows ?? []).map((row) => ({
    page: row.dimensionValues?.[0]?.value ?? '/',
    views: num(row.metricValues?.[0]?.value),
    sessions: num(row.metricValues?.[1]?.value),
  }));

  // Parse devices + compute percentages
  const deviceRows = deviceResp[0].rows ?? [];
  const totalDeviceSessions = deviceRows.reduce((s, r) => s + num(r.metricValues?.[0]?.value), 0);
  const devices: DeviceData[] = deviceRows.map((row) => {
    const sessions = num(row.metricValues?.[0]?.value);
    return {
      device: row.dimensionValues?.[0]?.value ?? 'Unknown',
      sessions,
      percentage: totalDeviceSessions > 0 ? Math.round((sessions / totalDeviceSessions) * 100) : 0,
    };
  });

  // Parse countries
  const countries: CountryData[] = (countryResp[0].rows ?? []).map((row) => ({
    country: row.dimensionValues?.[0]?.value ?? 'Unknown',
    sessions: num(row.metricValues?.[0]?.value),
  }));

  return {
    overview,
    trend,
    channels,
    topPages,
    devices,
    countries,
    dateRange: `${days}d`,
    propertyId,
    fetchedAt: new Date().toISOString(),
  };
}

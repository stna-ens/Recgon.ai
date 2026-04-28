import { BetaAnalyticsDataClient } from '@google-analytics/data';
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

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    // BetaAnalyticsDataClient's `authClient` parameter is typed against an
    // older google-auth-library AuthClient than the one OAuth2Client extends
    // here — cast through unknown to bridge the version mismatch.
    type AnalyticsClientOptions = ConstructorParameters<typeof BetaAnalyticsDataClient>[0];
    client = new BetaAnalyticsDataClient({
      authClient: oauth2Client as unknown as NonNullable<AnalyticsClientOptions>['authClient'],
    });
  } else if (authOptions.serviceAccountJson) {
    const credentials = JSON.parse(authOptions.serviceAccountJson);
    client = new BetaAnalyticsDataClient({ credentials });
  } else {
    throw new Error('No authentication method provided');
  }
  const property = `properties/${propertyId}`;
  const startDate = `${days}daysAgo`;

  const [overviewResp, trendResp, channelResp, pagesResp, deviceResp, countryResp] =
    await Promise.all([
      // 1. Overall summary for date range
      client.runReport({
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
      }),

      // 2. Daily trend
      client.runReport({
        property,
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
        ],
        dateRanges: [{ startDate, endDate: 'today' }],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
      }),

      // 3. Traffic channels
      client.runReport({
        property,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        dateRanges: [{ startDate, endDate: 'today' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),

      // 4. Top pages
      client.runReport({
        property,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
        dateRanges: [{ startDate, endDate: 'today' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),

      // 5. Device breakdown
      client.runReport({
        property,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
        dateRanges: [{ startDate, endDate: 'today' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),

      // 6. Top countries
      client.runReport({
        property,
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        dateRanges: [{ startDate, endDate: 'today' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
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

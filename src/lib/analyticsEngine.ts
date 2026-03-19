import { BetaAnalyticsDataClient } from '@google-analytics/data';

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

function makeClient(): BetaAnalyticsDataClient {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');
  const credentials = JSON.parse(raw);
  return new BetaAnalyticsDataClient({ credentials });
}

function num(val: string | null | undefined): number {
  return parseFloat(val ?? '0') || 0;
}

export async function fetchAnalyticsData(propertyId: string, days = 30): Promise<AnalyticsData> {
  const client = makeClient();
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

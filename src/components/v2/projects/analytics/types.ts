// Shapes used by the analytics page + components. Mirrors what
// /api/analytics/data returns and what /api/analytics/analyze persists.

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

export interface AnalyticsInsights {
  overallPerformance: 'growing' | 'stable' | 'declining' | 'insufficient_data';
  summary: string;
  keyInsights: string[];
  warnings: string[];
  opportunities: string[];
  recommendations: string[];
  topWin: string;
  topConcern: string;
}

export interface SavedAnalyticsInsight {
  id: string;
  projectId?: string;
  propertyId: string;
  days: number;
  dateRange?: string;
  overview?: Record<string, number>;
  insights: AnalyticsInsights;
  source: 'gui' | 'terminal' | 'system';
  createdAt: string;
}

export interface GAProperty {
  // The engine uses `id`, but other callers (and v2's older code) sometimes
  // used `propertyId`. Accept both shapes for safety.
  id?: string;
  propertyId?: string;
  displayName?: string;
  accountName?: string;
}

export interface PropertyConfig {
  propertyId: string | null;
  hasCredentials: boolean;
  authMethod: 'service_account' | 'oauth' | null;
  ownerUserId: string | null;
  oauthConfigured: boolean;
}

export type MetricKey = 'sessions' | 'activeUsers' | 'screenPageViews' | 'bounceRate' | 'averageSessionDuration';

// Per-tile derived data — current value, prior-period value, % delta, and
// the recent series for the inline sparkline. seriesLabels is the date
// for each point in `series` (same length), used by the hover tooltip.
export interface TileMetric {
  key: MetricKey;
  label: string;
  formatted: string;
  delta: number | null;
  series: number[];
  seriesLabels: string[];
  inverse?: boolean; // true for bounce rate where lower is better
  warn?: boolean;
}

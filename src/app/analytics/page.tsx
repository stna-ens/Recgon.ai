'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewMetrics {
  sessions: number;
  activeUsers: number;
  newUsers: number;
  screenPageViews: number;
  bounceRate: number;
  averageSessionDuration: number;
}

interface TrendPoint { date: string; sessions: number; users: number; pageViews: number; }
interface ChannelData { channel: string; sessions: number; percentage: number; }
interface PageData { page: string; views: number; sessions: number; }
interface DeviceData { device: string; sessions: number; percentage: number; }
interface CountryData { country: string; sessions: number; }

interface AnalyticsData {
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

interface AnalyticsInsights {
  overallPerformance: 'growing' | 'stable' | 'declining' | 'insufficient_data';
  summary: string;
  keyInsights: string[];
  warnings: string[];
  opportunities: string[];
  recommendations: string[];
  topWin: string;
  topConcern: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

const DEVICE_COLORS = ['#007AFF', '#e8a8c4', '#34C759', '#FF9F0A', '#AF52DE'];
const CHANNEL_COLORS = ['#007AFF', '#e8a8c4', '#34C759', '#FF9F0A', '#AF52DE', '#FF453A', '#64D2FF', '#FFD60A'];

const PERF_COLOR: Record<string, string> = {
  growing: '#34C759',
  stable: '#FF9F0A',
  declining: '#FF453A',
  insufficient_data: '#86868b',
};

const PERF_LABEL: Record<string, string> = {
  growing: 'Growing',
  stable: 'Stable',
  declining: 'Declining',
  insufficient_data: 'Insufficient Data',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--glass-substrate)',
      border: '1px solid rgba(128,128,128,0.12)',
      borderRadius: 'var(--r-md)',
      padding: '20px 24px',
      backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: 'var(--shadow-float)',
    }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: '1.7rem', fontWeight: 600, color: 'var(--txt-pure)', lineHeight: 1.2 }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: '0.75rem', color: 'var(--txt-faint)' }}>{sub}</span>}
    </div>
  );
}

function SectionCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--glass-substrate)',
      border: '1px solid rgba(128,128,128,0.12)',
      borderRadius: 'var(--r-md)',
      padding: '24px',
      backdropFilter: 'blur(20px)',
      boxShadow: 'var(--shadow-float)',
      ...style,
    }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// Custom tooltip for recharts
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--glass-substrate)',
      border: '1px solid rgba(128,128,128,0.15)',
      borderRadius: 12,
      padding: '10px 14px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      fontSize: '0.8rem',
    }}>
      {label && <div style={{ color: 'var(--txt-muted)', marginBottom: 6, fontWeight: 500 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--txt-pure)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--txt-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Setup screen (no service account or no property) ─────────────────────────

function SetupScreen({ hasServiceAccount, onSave }: { hasServiceAccount: boolean; onSave: (id: string) => Promise<void> }) {
  const [id, setId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!id.trim()) return;
    setSaving(true);
    setErr('');
    try {
      await onSave(id.trim());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 8 }}>Connect Google Analytics</h1>
      <p style={{ color: 'var(--txt-muted)', marginBottom: 40, lineHeight: 1.6 }}>
        Recgon reads your GA4 data to surface insights and AI-powered recommendations.
      </p>

      {!hasServiceAccount && (
        <div style={{
          background: 'rgba(255,59,48,0.08)',
          border: '1px solid rgba(255,59,48,0.2)',
          borderRadius: 'var(--r-sm)',
          padding: '16px 20px',
          marginBottom: 32,
        }}>
          <p style={{ fontWeight: 600, color: '#FF3B30', marginBottom: 8, fontSize: '0.9rem' }}>
            Service account not configured
          </p>
          <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
            Add your Google service account JSON to <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem' }}>.env.local</code>:
          </p>
          <pre style={{
            marginTop: 12,
            padding: '12px 16px',
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 8,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.78rem',
            color: 'var(--txt-pure)',
            overflowX: 'auto',
            lineHeight: 1.5,
          }}>{`GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}'`}</pre>
          <p style={{ marginTop: 12, color: 'var(--txt-faint)', fontSize: '0.8rem', lineHeight: 1.5 }}>
            1. Go to Google Cloud Console → IAM → Service Accounts → Create<br />
            2. Grant the service account <strong>&quot;Viewer&quot;</strong> role in your GA4 property<br />
            3. Download the JSON key and paste the contents (minified) as the env value
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>GA4 Property ID</label>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="e.g. 123456789"
          style={{
            padding: '12px 16px',
            background: 'var(--glass-substrate)',
            border: '1px solid rgba(128,128,128,0.2)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--txt-pure)',
            fontSize: '0.95rem',
            outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.8rem', marginTop: -8 }}>
          Find it in GA4 → Admin → Property Settings → Property ID
        </p>
        {err && <p style={{ color: '#FF3B30', fontSize: '0.85rem' }}>{err}</p>}
        <button
          onClick={handleSave}
          disabled={saving || !id.trim() || !hasServiceAccount}
          style={{
            padding: '12px 24px',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-txt)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: saving || !id.trim() || !hasServiceAccount ? 'not-allowed' : 'pointer',
            opacity: saving || !id.trim() || !hasServiceAccount ? 0.5 : 1,
            alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : 'Connect Property'}
        </button>
      </div>
    </div>
  );
}

// ─── AI Insights panel ────────────────────────────────────────────────────────

function InsightsPanel({ insights, loading, onAnalyze }: {
  insights: AnalyticsInsights | null;
  loading: boolean;
  onAnalyze: () => void;
}) {
  if (loading) {
    return (
      <SectionCard title="AI Insights">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--txt-muted)', padding: '20px 0' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Recgon is analyzing your data…
        </div>
      </SectionCard>
    );
  }

  if (!insights) {
    return (
      <SectionCard title="AI Insights">
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.9rem', marginBottom: 16 }}>
          Let Recgon analyze your analytics data and surface actionable insights.
        </p>
        <button
          onClick={onAnalyze}
          style={{
            padding: '10px 20px',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-txt)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Analyze with Recgon
        </button>
      </SectionCard>
    );
  }

  const perfColor = PERF_COLOR[insights.overallPerformance] ?? '#86868b';
  const perfLabel = PERF_LABEL[insights.overallPerformance] ?? insights.overallPerformance;

  return (
    <SectionCard title="AI Insights">
      {/* Performance badge + summary */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <span style={{
          padding: '4px 12px',
          background: `${perfColor}18`,
          color: perfColor,
          borderRadius: 'var(--r-pill)',
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
          border: `1px solid ${perfColor}30`,
        }}>
          {perfLabel}
        </span>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>{insights.summary}</p>
      </div>

      {/* Top win + concern */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.2)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#34C759', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Top Win</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>{insights.topWin}</p>
        </div>
        <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#FF3B30', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Top Concern</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>{insights.topConcern}</p>
        </div>
      </div>

      {/* Key insights */}
      {insights.keyInsights.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Key Insights</h4>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {insights.keyInsights.map((ins, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: '#007AFF', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>•</span>
                {ins}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {insights.warnings.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: '#FF9F0A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Warnings</h4>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {insights.warnings.map((w, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: '#FF9F0A', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>⚠</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {insights.opportunities.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: '#34C759', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Opportunities</h4>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {insights.opportunities.map((o, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: '#34C759', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>↑</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Recommendations</h4>
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.recommendations.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-txt)',
                  width: 20, height: 20,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700,
                  flexShrink: 0, marginTop: 1,
                }}>
                  {i + 1}
                </span>
                {r}
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        onClick={onAnalyze}
        style={{
          marginTop: 20,
          padding: '8px 16px',
          background: 'var(--btn-secondary-bg)',
          color: 'var(--txt-muted)',
          border: '1px solid var(--btn-secondary-border)',
          borderRadius: 'var(--r-sm)',
          fontWeight: 500,
          fontSize: '0.8rem',
          cursor: 'pointer',
        }}
      >
        Re-analyze
      </button>
    </SectionCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [hasServiceAccount, setHasServiceAccount] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  // Check config on mount
  useEffect(() => {
    async function checkConfig() {
      const [propRes, envRes] = await Promise.all([
        fetch('/api/analytics/property').then((r) => r.ok ? r.json() : { propertyId: null }),
        // Check env by pinging data endpoint with no property — it'll fail with specific error
        fetch('/api/analytics/data?days=1').then((r) => r.json()),
      ]);
      setPropertyId(propRes.propertyId ?? null);
      // If error is about service account specifically, mark not configured
      setHasServiceAccount(!envRes.error?.includes('GOOGLE_SERVICE_ACCOUNT_JSON'));
      setConfigLoaded(true);
    }
    checkConfig();
  }, []);

  const fetchData = useCallback(async (selectedDays: number) => {
    setLoadingData(true);
    setError('');
    setInsights(null);
    try {
      const res = await fetch(`/api/analytics/data?days=${selectedDays}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to fetch');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch analytics');
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Auto-fetch when property is set
  useEffect(() => {
    if (configLoaded && propertyId) {
      fetchData(days);
    }
  }, [configLoaded, propertyId, fetchData, days]);

  async function handleSaveProperty(id: string) {
    const res = await fetch('/api/analytics/property', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to save');
    setPropertyId(id);
  }

  async function handleAnalyze() {
    if (!data) return;
    setLoadingInsights(true);
    try {
      const res = await fetch('/api/analytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
      setInsights(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoadingInsights(false);
    }
  }

  function handleDaysChange(newDays: number) {
    setDays(newDays);
    if (propertyId) fetchData(newDays);
  }

  if (!configLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-muted)' }}>
        Loading…
      </div>
    );
  }

  // Show setup screen if no service account or no property
  if (!hasServiceAccount || !propertyId) {
    return <SetupScreen hasServiceAccount={hasServiceAccount} onSave={handleSaveProperty} />;
  }

  return (
    <div style={{ padding: '40px 48px', maxWidth: 'var(--max-w)', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 4 }}>Analytics</h1>
          <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem' }}>
            Property <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', background: 'rgba(128,128,128,0.1)', padding: '1px 6px', borderRadius: 4 }}>{propertyId}</code>
            {data && <> · Last fetched {new Date(data.fetchedAt).toLocaleTimeString()}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Days selector */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--glass-substrate)', border: '1px solid rgba(128,128,128,0.12)', borderRadius: 'var(--r-sm)', padding: 4 }}>
            {DAYS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleDaysChange(opt.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 10,
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: days === opt.value ? 'var(--btn-primary-bg)' : 'transparent',
                  color: days === opt.value ? 'var(--btn-primary-txt)' : 'var(--txt-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={() => fetchData(days)}
            disabled={loadingData}
            style={{
              padding: '8px 16px',
              background: 'var(--btn-secondary-bg)',
              color: 'var(--txt-muted)',
              border: '1px solid var(--btn-secondary-border)',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: loadingData ? 'not-allowed' : 'pointer',
              opacity: loadingData ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={loadingData ? { animation: 'spin 1s linear infinite' } : {}}>
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.45"/>
            </svg>
            Refresh
          </button>
          {/* Change property */}
          <button
            onClick={() => setPropertyId(null)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: 'var(--txt-faint)',
              border: '1px solid rgba(128,128,128,0.15)',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Change property
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(255,59,48,0.08)',
          border: '1px solid rgba(255,59,48,0.2)',
          borderRadius: 'var(--r-sm)',
          padding: '12px 16px',
          marginBottom: 24,
          color: '#FF3B30',
          fontSize: '0.88rem',
        }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loadingData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--txt-muted)', padding: '60px 0', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Fetching analytics data…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {data && !loadingData && (
        <>
          {/* Overview metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}>
            <MetricCard label="Sessions" value={fmtNum(data.overview.sessions)} />
            <MetricCard label="Active Users" value={fmtNum(data.overview.activeUsers)} sub={`${fmtNum(data.overview.newUsers)} new`} />
            <MetricCard label="Page Views" value={fmtNum(data.overview.screenPageViews)} />
            <MetricCard label="Bounce Rate" value={`${data.overview.bounceRate.toFixed(1)}%`} />
            <MetricCard label="Avg Session" value={fmtDuration(data.overview.averageSessionDuration)} />
          </div>

          {/* Trend chart */}
          <SectionCard title={`Sessions & Users — Last ${days} Days`} style={{ marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: 'var(--txt-faint)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--txt-faint)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtNum}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: 12 }} />
                <Line type="monotone" dataKey="sessions" stroke="#007AFF" strokeWidth={2} dot={false} name="Sessions" />
                <Line type="monotone" dataKey="users" stroke="#e8a8c4" strokeWidth={2} dot={false} name="Users" />
                <Line type="monotone" dataKey="pageViews" stroke="#34C759" strokeWidth={2} dot={false} name="Page Views" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Row: Channels + Devices */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Traffic channels */}
            <SectionCard title="Traffic Channels">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.channels} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                  <YAxis
                    type="category"
                    dataKey="channel"
                    width={100}
                    tick={{ fontSize: 11, fill: 'var(--txt-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sessions" name="Sessions" radius={[0, 4, 4, 0]}>
                    {data.channels.map((_, idx) => (
                      <Cell key={idx} fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            {/* Device breakdown */}
            <SectionCard title="Devices">
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.devices}
                      dataKey="sessions"
                      nameKey="device"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      strokeWidth={0}
                    >
                      {data.devices.map((_, idx) => (
                        <Cell key={idx} fill={DEVICE_COLORS[idx % DEVICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {data.devices.map((d, idx) => (
                    <div key={d.device} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: DEVICE_COLORS[idx % DEVICE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: 'var(--txt-muted)', textTransform: 'capitalize', flex: 1 }}>{d.device}</span>
                      <span style={{ color: 'var(--txt-pure)', fontWeight: 600 }}>{d.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Row: Top pages + Top countries */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Top pages */}
            <SectionCard title="Top Pages">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {data.topPages.slice(0, 8).map((page, i) => {
                  const maxViews = data.topPages[0]?.views || 1;
                  const pct = (page.views / maxViews) * 100;
                  return (
                    <div key={i} style={{
                      padding: '9px 0',
                      borderBottom: i < data.topPages.length - 1 ? '1px solid rgba(128,128,128,0.08)' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--txt-pure)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                          {page.page}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--txt-muted)', fontWeight: 500, flexShrink: 0 }}>
                          {fmtNum(page.views)}
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'rgba(128,128,128,0.1)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#007AFF', borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* Top countries */}
            <SectionCard title="Top Countries">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.countries.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                  <YAxis
                    type="category"
                    dataKey="country"
                    width={90}
                    tick={{ fontSize: 11, fill: 'var(--txt-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sessions" name="Sessions" fill="#007AFF" radius={[0, 4, 4, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* AI Insights */}
          <InsightsPanel
            insights={insights}
            loading={loadingInsights}
            onAnalyze={handleAnalyze}
          />

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Select from '@/components/Select';
import { useTeam } from '@/components/TeamProvider';

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

interface ProjectSummary {
  id: string;
  name: string;
  analyticsPropertyId?: string;
}

interface GAProperty {
  id: string;
  displayName: string;
  accountName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

const GLASS = [
  { base: '#a855f7', hi: '#f3e8ff', lo: '#5b21b6' },
  { base: '#22d3ee', hi: '#ecfeff', lo: '#0e7490' },
  { base: '#4ade80', hi: '#dcfce7', lo: '#15803d' },
  { base: '#fb923c', hi: '#fff7ed', lo: '#c2410c' },
  { base: '#f472b6', hi: '#fdf2f8', lo: '#9d174d' },
  { base: '#60a5fa', hi: '#eff6ff', lo: '#1d4ed8' },
  { base: '#facc15', hi: '#fefce8', lo: '#a16207' },
  { base: '#34d399', hi: '#ecfdf5', lo: '#065f46' },
];
const DEVICE_COLORS = GLASS.slice(0, 5).map(g => g.base);
const CHANNEL_COLORS = GLASS.map(g => g.base);

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

// ─── Error parser ────────────────────────────────────────────────────────────

function parseAnalyticsError(raw: string): { title: string; steps: string[] } {
  if (raw.includes('has not been used') || (raw.includes('PERMISSION_DENIED') && raw.includes('disabled'))) {
    return {
      title: 'Google Analytics Data API is not enabled',
      steps: [
        'Go to Google Cloud Console → APIs & Services → Library',
        'Search for "Google Analytics Data API" and click Enable',
        'Wait 1–2 minutes for it to propagate, then refresh',
      ],
    };
  }
  if (raw.includes('PERMISSION_DENIED')) {
    return {
      title: "Service account doesn't have access to this property",
      steps: [
        'In Google Analytics → Admin → Property Access Management',
        'Click + and add your service account email (the client_email from your JSON key)',
        'Set the role to Viewer, save, then refresh',
      ],
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('not found')) {
    return {
      title: 'Property not found',
      steps: [
        'Double-check the Property ID — it should be a plain number like 123456789',
        'Do not use the Measurement ID (G-XXXXXXXX)',
        'Click "Change property" and re-enter the correct ID',
      ],
    };
  }
  if (raw.includes('UNAUTHENTICATED') || raw.includes('invalid_grant') || raw.includes('Could not load')) {
    return {
      title: 'Service account credentials are invalid',
      steps: [
        'The JSON key may be malformed or revoked',
        'Click "Change property" to re-enter your credentials',
        'Make sure you pasted the full contents of the downloaded .json key file',
      ],
    };
  }
  return { title: 'Failed to load analytics data', steps: [raw] };
}

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

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="recgon-label" style={{ marginBottom: 6 }}>{label}</span>
      <span style={{ fontSize: '1.7rem', fontWeight: 600, color, lineHeight: 1.2, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: '0.75rem', color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{sub}</span>}
    </div>
  );
}

function SectionCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="glass-card" style={{ padding: '24px', ...style }}>
      <span className="recgon-label">{title}</span>
      {children}
    </div>
  );
}

// Custom tooltip for recharts
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card" style={{ padding: '10px 14px', fontSize: '0.8rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
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


function LinkPropertyBanner({ projectName, propertyId, onChange, onSave, saving, error, gaProperties, propertiesLoading }: {
  projectName: string;
  propertyId: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string;
  gaProperties: GAProperty[];
  propertiesLoading: boolean;
}) {
  return (
    <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24, borderColor: 'rgba(168,85,247,0.3)' }}>
      <p style={{ fontWeight: 600, marginBottom: 8, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.9rem' }}>
        Link a GA4 property to <span style={{ color: 'var(--signature)' }}>{projectName}</span>
      </p>
      <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.6 }}>
        {gaProperties.length > 0
          ? 'Choose the GA4 property to link to this project.'
          : 'Enter the numeric Property ID from Google Analytics → Admin → Property details.'}
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {propertiesLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--txt-muted)', fontSize: '0.85rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            <div className="loader-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Loading properties…
          </div>
        ) : gaProperties.length > 0 ? (
          <Select
            value={propertyId}
            onChange={onChange}
            options={gaProperties.map((p) => ({ value: p.id, label: `${p.displayName}  ·  ${p.accountName}` }))}
            placeholder="Select a property…"
            style={{ width: 320 }}
          />
        ) : (
          <input
            value={propertyId}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 123456789"
            className="form-input"
            style={{ maxWidth: 220, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
            autoFocus
          />
        )}
        <button
          onClick={onSave}
          disabled={saving || !propertyId.trim()}
          className="btn btn-primary btn-sm"
          style={{ opacity: saving || !propertyId.trim() ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Link property'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.83rem', marginTop: 10, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{error}</p>}
    </div>
  );
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onSave, oauthConfigured, needsPropertyId, onPropertyIdSave, gaProperties, propertiesLoading, propertiesError, onRetryProperties }: {
  onSave: (propertyId: string, serviceAccountJson: string) => Promise<void>;
  oauthConfigured: boolean;
  needsPropertyId: boolean;
  onPropertyIdSave: (propertyId: string) => Promise<void>;
  gaProperties: GAProperty[];
  propertiesLoading: boolean;
  propertiesError: string;
  onRetryProperties: () => void;
}) {
  const [id, setId] = useState('');
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const canSave = id.trim() && json.trim();

  function handleFileLoad(file: File) {
    if (!file.name.endsWith('.json')) {
      setErr('Please upload a .json file');
      return;
    }
    if (file.size > 50_000) {
      setErr('File too large — service account keys are typically under 5 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (!parsed.client_email || !parsed.private_key) {
          setErr('Invalid service account key — missing client_email or private_key');
          return;
        }
        setJson(text);
        setFileName(file.name);
        setErr('');
      } catch {
        setErr('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setErr('');
    try {
      await onSave(id.trim(), json.trim());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handlePropertyIdSave() {
    if (!id.trim()) return;
    setSaving(true);
    setErr('');
    try {
      await onPropertyIdSave(id.trim());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // After OAuth, user picks their GA4 property from a list
  if (needsPropertyId) {
    const propertyOptions = gaProperties.map((p) => ({
      value: p.id,
      label: `${p.displayName}  ·  ${p.accountName}`,
    }));

    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <svg width="20" height="20" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '-0.5px' }}>
            Google account connected
          </h1>
        </div>
        <p style={{ color: 'var(--txt-muted)', marginBottom: 32, lineHeight: 1.6 }}>
          Select the GA4 property you want to connect to Recgon.
        </p>

        {propertiesLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--txt-muted)', fontSize: '0.85rem', marginBottom: 20, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            <div className="loader-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            Loading your properties…
          </div>
        )}

        {!propertiesLoading && propertiesError && (() => {
          const isApiNotEnabled = propertiesError.includes('has not been used') || propertiesError.includes('disabled');
          return (
            <div className="glass-card" style={{ borderColor: 'rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.04)', marginBottom: 20, padding: '16px 20px' }}>
              {isApiNotEnabled ? (
                <>
                  <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.88rem', marginBottom: 8, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                    ! Google Analytics Admin API is not enabled
                  </p>
                  <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li style={{ color: 'var(--txt-muted)', fontSize: '0.83rem', lineHeight: 1.6 }}>Go to <strong>Google Cloud Console → APIs &amp; Services → Library</strong></li>
                    <li style={{ color: 'var(--txt-muted)', fontSize: '0.83rem', lineHeight: 1.6 }}>Search for <strong>&quot;Google Analytics Admin API&quot;</strong> and click Enable</li>
                    <li style={{ color: 'var(--txt-muted)', fontSize: '0.83rem', lineHeight: 1.6 }}>Wait 1–2 minutes, then click Retry below</li>
                  </ol>
                </>
              ) : (
                <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                  {propertiesError}
                </p>
              )}
            </div>
          );
        })()}

        {!propertiesLoading && !propertiesError && gaProperties.length === 0 && (
          <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', marginBottom: 16, lineHeight: 1.6 }}>
            No GA4 properties found on this account. Make sure you have at least one GA4 property in Google Analytics.
          </p>
        )}

        {!propertiesLoading && gaProperties.length > 0 && (
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">GA4 Property</label>
            <Select
              value={id}
              onChange={setId}
              options={propertyOptions}
              placeholder="Select a property…"
            />
          </div>
        )}

        {err && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0 0 16px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          {propertiesError && (
            <button
              onClick={onRetryProperties}
              disabled={propertiesLoading}
              className="btn btn-secondary btn-sm"
            >
              Retry
            </button>
          )}
          <button
            onClick={handlePropertyIdSave}
            disabled={saving || !id.trim() || propertiesLoading}
            className="btn btn-primary btn-sm"
            style={{ opacity: saving || !id.trim() || propertiesLoading ? 0.5 : 1, cursor: saving || !id.trim() || propertiesLoading ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 8, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '-0.5px' }}>
        <span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>connect google-analytics
      </h1>
      <p style={{ color: 'var(--txt-muted)', marginBottom: 40, lineHeight: 1.6 }}>
        Recgon reads your GA4 data to surface insights and recommendations.
      </p>

      {/* OAuth — primary option */}
      {oauthConfigured && (
        <div className="glass-card" style={{ marginBottom: 24, padding: '28px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--txt-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Sign in with your Google account to grant Recgon read-only access to your analytics.
          </p>
          <a
            href="/api/analytics/oauth"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 28px', fontSize: 14, textDecoration: 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect with Google
          </a>
          <p style={{ fontSize: 12, color: 'var(--txt-faint)', marginTop: 14 }}>
            Read-only access — Recgon can only view your analytics data
          </p>
        </div>
      )}

      {/* Divider */}
      {oauthConfigured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', monospace" }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      )}

      {/* Service account — secondary / fallback */}
      {(!oauthConfigured || showManual) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Service Account Key (JSON)</label>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileLoad(file);
              }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--signature)' : json ? 'var(--success)' : 'var(--btn-secondary-border)'}`,
                borderRadius: 12,
                padding: '24px 20px',
                textAlign: 'center',
                marginBottom: 12,
                background: dragOver ? 'rgba(232,168,196,0.05)' : json ? 'rgba(52,199,89,0.04)' : 'transparent',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('sa-file-input')?.click()}
            >
              <input
                id="sa-file-input"
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileLoad(file);
                  e.target.value = '';
                }}
              />
              {json ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                    {fileName || 'Key loaded'} — click to replace
                  </span>
                </div>
              ) : (
                <>
                  <svg width="24" height="24" fill="none" stroke="var(--txt-muted)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: 8 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p style={{ fontSize: 13, color: 'var(--txt-muted)', margin: 0 }}>
                    Drop your <strong>.json</strong> key file here or click to browse
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--txt-faint)', margin: '6px 0 0' }}>
                    Or paste the JSON contents below
                  </p>
                </>
              )}
            </div>

            <textarea
              value={json}
              onChange={(e) => { setJson(e.target.value); setFileName(''); }}
              placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  "private_key": "..."\n}'}
              rows={6}
              className="form-textarea"
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.78rem', resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ color: 'var(--txt-faint)', fontSize: '0.78rem', lineHeight: 1.8, marginTop: 8 }}>
              <strong style={{ color: 'var(--txt-muted)' }}>How to get this:</strong><br />
              1. In <strong>Google Cloud Console</strong>, search for <em>Google Analytics Data API</em> and enable it<br />
              2. Go to <strong>IAM &amp; Admin</strong> → Service Accounts → Create Service Account (skip role grants)<br />
              3. Open the created service account → <strong>Keys</strong> tab → Add Key → Create new key → <strong>JSON</strong> → download<br />
              4. Drop the downloaded file above or paste its contents<br />
              5. In <strong>Google Analytics</strong> → Admin → <strong>Property Access Management</strong> → click + → add the service account&apos;s email (<code style={{ background: 'rgba(128,128,128,0.1)', padding: '1px 5px', borderRadius: 3 }}>client_email</code> in the JSON) with <strong>Viewer</strong> role
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">GA4 Property ID</label>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. 123456789"
              className="form-input"
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <p style={{ color: 'var(--txt-faint)', fontSize: '0.78rem', lineHeight: 1.8, marginTop: 8 }}>
              In <strong style={{ color: 'var(--txt-muted)' }}>Google Analytics</strong> → <strong style={{ color: 'var(--txt-muted)' }}>Admin</strong> → <strong style={{ color: 'var(--txt-muted)' }}>Property details</strong> → copy the numeric <strong style={{ color: 'var(--txt-muted)' }}>Property ID</strong> (not the Measurement ID).
            </p>
          </div>

          {err && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{err}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="btn btn-primary btn-sm"
            style={{ alignSelf: 'flex-start', opacity: saving || !canSave ? 0.5 : 1, cursor: saving || !canSave ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Connecting…' : 'Connect Property'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowManual(true)}
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Use service account instead
        </button>
      )}
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
      <SectionCard title="Recgon Insights">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0' }}>
          <div className="loader-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
          <span style={{ color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.85rem' }}>analyzing your data…</span>
        </div>
      </SectionCard>
    );
  }

  if (!insights) {
    return (
      <SectionCard title="Recgon Insights">
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.9rem', marginBottom: 16 }}>
          Let Recgon analyze your analytics data and surface actionable insights.
        </p>
        <button onClick={onAnalyze} className="btn btn-primary btn-sm">
          Analyze with Recgon
        </button>
      </SectionCard>
    );
  }

  const perfColor = PERF_COLOR[insights.overallPerformance] ?? '#86868b';
  const perfLabel = PERF_LABEL[insights.overallPerformance] ?? insights.overallPerformance;

  return (
    <SectionCard title="Recgon Insights">
      {/* Performance badge + summary */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <span style={{
          padding: '4px 12px',
          background: `${perfColor}18`,
          color: perfColor,
          borderRadius: 'var(--r-pill)',
          fontSize: '0.72rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          flexShrink: 0,
          border: `1px solid ${perfColor}30`,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        }}>
          {perfLabel}
        </span>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>{insights.summary}</p>
      </div>

      {/* Top win + concern */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'rgba(52,199,89,0.06)', border: '1px solid rgba(52,199,89,0.2)', borderRadius: 'var(--r-sm)', padding: '12px 16px' }}>
          <span className="recgon-label" style={{ color: 'var(--success)', marginBottom: 8 }}>top win</span>
          <p style={{ fontSize: '0.85rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>{insights.topWin}</p>
        </div>
        <div style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 'var(--r-sm)', padding: '12px 16px' }}>
          <span className="recgon-label" style={{ color: 'var(--danger)', marginBottom: 8 }}>top concern</span>
          <p style={{ fontSize: '0.85rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>{insights.topConcern}</p>
        </div>
      </div>

      {/* Key insights */}
      {insights.keyInsights.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <span className="recgon-label">key insights</span>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {insights.keyInsights.map((ins, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--signature)', fontWeight: 700, flexShrink: 0, marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>›</span>
                {ins}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {insights.warnings.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <span className="recgon-label" style={{ color: 'var(--danger)' }}>warnings</span>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {insights.warnings.map((w, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--danger)', fontWeight: 700, flexShrink: 0, marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>!</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {insights.opportunities.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <span className="recgon-label" style={{ color: 'var(--success)' }}>opportunities</span>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {insights.opportunities.map((o, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--success)', fontWeight: 700, flexShrink: 0, marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>↑</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div>
          <span className="recgon-label">recommendations</span>
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.recommendations.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{
                  color: 'var(--signature)',
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: '0.75rem', fontWeight: 700,
                  flexShrink: 0, marginTop: 2,
                }}>
                  {String(i + 1).padStart(2, '0')}.
                </span>
                {r}
              </li>
            ))}
          </ol>
        </div>
      )}

      <button onClick={onAnalyze} className="btn btn-secondary btn-sm" style={{ marginTop: 20 }}>
        Re-analyze
      </button>
    </SectionCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { currentTeam } = useTeam();
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [authMethod, setAuthMethod] = useState<'oauth' | 'service_account' | null>(null);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [linkingPropertyId, setLinkingPropertyId] = useState('');
  const [linkingSaving, setLinkingSaving] = useState(false);
  const [linkingError, setLinkingError] = useState('');
  const [gaProperties, setGaProperties] = useState<GAProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState('');

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activePropertyId = selectedProject?.analyticsPropertyId ?? propertyId;

  const insightsKey = activePropertyId
    ? `analytics_insights_${activePropertyId}_${selectedProjectId ?? 'global'}_${days}`
    : null;

  // Load cached insights from localStorage when property/days are known
  useEffect(() => {
    if (!insightsKey) return;
    try {
      const cached = localStorage.getItem(insightsKey);
      if (cached) setInsights(JSON.parse(cached));
    } catch { /* ignore */ }
  }, [insightsKey]);

  async function fetchProperties() {
    setPropertiesLoading(true);
    setPropertiesError('');
    try {
      const res = await fetch('/api/analytics/properties');
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to load properties');
      }
      setGaProperties(await res.json());
    } catch (e: unknown) {
      setPropertiesError(e instanceof Error ? e.message : 'Failed to load properties');
    } finally {
      setPropertiesLoading(false);
    }
  }

  // Check config on mount
  useEffect(() => {
    async function checkConfig() {
      const res = await fetch('/api/analytics/property').then((r) => r.ok ? r.json() : { propertyId: null, hasCredentials: false, oauthConfigured: false, authMethod: null });
      setPropertyId(res.hasCredentials && res.propertyId ? res.propertyId : null);
      setHasCredentials(res.hasCredentials ?? false);
      setOauthConfigured(res.oauthConfigured ?? false);
      setAuthMethod(res.authMethod ?? null);
      setConfigLoaded(true);
      if (res.authMethod === 'oauth' && res.hasCredentials) {
        fetchProperties();
      }
    }
    checkConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load project list
  useEffect(() => {
    if (!currentTeam) return;
    fetch(`/api/projects?teamId=${currentTeam.id}`).then((r) => r.ok ? r.json() : []).then(setProjects).catch(() => {});
  }, [currentTeam]);

  const fetchData = useCallback(async (selectedDays: number, pId?: string | null) => {
    setLoadingData(true);
    setError('');
    try {
      const projectParam = pId ? `&projectId=${pId}` : '';
      const res = await fetch(`/api/analytics/data?days=${selectedDays}${projectParam}`, {
        headers: currentTeam ? { 'x-team-id': currentTeam.id } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to fetch');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch analytics');
    } finally {
      setLoadingData(false);
    }
  }, [currentTeam]);

  // Auto-fetch when config or selected project changes
  useEffect(() => {
    if (!configLoaded) return;
    if (hasCredentials && activePropertyId) {
      fetchData(days, selectedProjectId);
    }
  }, [configLoaded, hasCredentials, activePropertyId, fetchData, days, selectedProjectId]);

  async function handleSaveProperty(id: string, serviceAccountJson: string) {
    const res = await fetch('/api/analytics/property', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: id, serviceAccountJson }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to save');
    setPropertyId(id);
    setHasCredentials(true);
  }

  async function handlePropertyIdSave(id: string) {
    const res = await fetch('/api/analytics/property', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'set_property_id', propertyId: id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to save');
    setPropertyId(id);
  }

  async function handleLinkProperty(projectId: string, pid: string) {
    setLinkingSaving(true);
    setLinkingError('');
    try {
      const res = await fetch('/api/analytics/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(currentTeam ? { 'x-team-id': currentTeam.id } : {}) },
        body: JSON.stringify({ type: 'set_project_property', projectId, propertyId: pid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save');
      setProjects((prev) =>
        prev.map((p) => p.id === projectId ? { ...p, analyticsPropertyId: pid } : p)
      );
      setLinkingPropertyId('');
      fetchData(days, projectId);
    } catch (e: unknown) {
      setLinkingError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setLinkingSaving(false);
    }
  }

  async function handleAnalyze() {
    if (!data) return;
    setLoadingInsights(true);
    setInsights(null);
    if (insightsKey) localStorage.removeItem(insightsKey);
    try {
      const res = await fetch('/api/analytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
      setInsights(json);
      if (insightsKey) localStorage.setItem(insightsKey, JSON.stringify(json));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoadingInsights(false);
    }
  }

  function handleDaysChange(newDays: number) {
    setDays(newDays);
    if (activePropertyId) fetchData(newDays, selectedProjectId);
  }

  if (!configLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-muted)' }}>
        Loading…
      </div>
    );
  }

  const needsPropertyId = authMethod === 'oauth' && hasCredentials && !propertyId;

  // Show setup screen if credentials not configured, or OAuth user hasn't selected a property yet
  if (!hasCredentials || needsPropertyId) {
    return (
      <SetupScreen
        onSave={handleSaveProperty}
        oauthConfigured={oauthConfigured}
        needsPropertyId={needsPropertyId}
        onPropertyIdSave={handlePropertyIdSave}
        gaProperties={gaProperties}
        propertiesLoading={propertiesLoading}
        propertiesError={propertiesError}
        onRetryProperties={fetchProperties}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 4, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '-0.5px' }}>
          <span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>analytics
        </h1>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace", marginBottom: 16 }}>
          {selectedProject && selectedProject.analyticsPropertyId && <>property <code style={{ color: 'var(--signature)', fontSize: '0.8rem' }}>{selectedProject.analyticsPropertyId}</code> · </>}
          {selectedProject ? selectedProject.name : 'All projects'}
          {data && <> · fetched {new Date(data.fetchedAt).toLocaleTimeString()}</>}
        </p>

        {/* Toolbar strip */}
        <div className="analytics-toolbar" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--glass-substrate)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid var(--btn-secondary-border)',
          borderRadius: 'var(--r-sm)',
          padding: '8px 12px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.05)',
          gap: 12,
        }}>
          {/* Left: project selector */}
          <div style={{ flexShrink: 0, minWidth: 0 }}>
            {projects.length > 0 ? (
              <Select
                value={selectedProjectId ?? ''}
                onChange={(val) => {
                  setSelectedProjectId(val || null);
                  setData(null);
                  setInsights(null);
                  setError('');
                  setLinkingPropertyId('');
                  setLinkingError('');
                }}
                placeholder="All projects"
                options={[
                  { value: '', label: 'All projects' },
                  ...projects.map((p) => ({
                    value: p.id,
                    label: p.analyticsPropertyId ? `${p.name}  ·  ${p.analyticsPropertyId}` : `${p.name}  ·  not linked`,
                  })),
                ]}
                style={{ width: 220 }}
              />
            ) : (
              <span style={{ fontSize: '0.85rem', color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>All projects</span>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 22, background: 'var(--btn-secondary-border)', flexShrink: 0 }} />

          {/* Right: time + controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg-deep)', border: '1px solid var(--btn-secondary-border)', borderRadius: 10, padding: 3 }}>
              {DAYS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleDaysChange(opt.value)}
                  className={`day-btn${days === opt.value ? ' day-btn--active' : ''}`}
                  style={{
                    padding: '5px 13px',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    background: days === opt.value ? 'var(--btn-primary-bg)' : 'transparent',
                    color: days === opt.value ? 'var(--btn-primary-txt)' : 'var(--txt-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchData(days, selectedProjectId)}
              disabled={loadingData}
              className="btn btn-secondary btn-sm"
              style={{ opacity: loadingData ? 0.5 : 1, cursor: loadingData ? 'not-allowed' : 'pointer' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={loadingData ? { animation: 'spin 1s linear infinite' } : {}}>
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.45"/>
              </svg>
              Refresh
            </button>
            <button
              onClick={async () => {
                await fetch('/api/analytics/property', { method: 'DELETE' });
                setPropertyId(null);
                setHasCredentials(false);
                setAuthMethod(null);
                setData(null);
                setError('');
              }}
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--txt-muted)' }}
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Link property banner — shown when a project is selected but has no GA4 property */}
      {selectedProject && !selectedProject.analyticsPropertyId && (
        <LinkPropertyBanner
          projectName={selectedProject.name}
          propertyId={linkingPropertyId}
          onChange={setLinkingPropertyId}
          onSave={() => handleLinkProperty(selectedProject.id, linkingPropertyId)}
          saving={linkingSaving}
          error={linkingError}
          gaProperties={gaProperties}
          propertiesLoading={propertiesLoading}
        />
      )}

      {/* Error */}
      {error && (() => {
        const { title, steps } = parseAnalyticsError(error);
        return (
          <div className="glass-card" style={{ borderColor: 'rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.04)', marginBottom: 24, padding: '16px 20px' }}>
            <p style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.9rem', marginBottom: steps.length > 1 ? 10 : 0, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              ! {title}
            </p>
            {steps.length > 1 && (
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ color: 'var(--txt-muted)', fontSize: '0.83rem', lineHeight: 1.6 }}>{s}</li>
                ))}
              </ol>
            )}
            {steps.length === 1 && (
              <p style={{ color: 'var(--txt-muted)', fontSize: '0.83rem', margin: 0 }}>{steps[0]}</p>
            )}
          </div>
        );
      })()}

      {/* Loading skeleton */}
      {loadingData && (
        <div className="loader">
          <div className="loader-spinner" />
          <div className="loader-text" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>fetching analytics data…</div>
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
            <MetricCard label="Sessions"    value={fmtNum(data.overview.sessions)}                             color="#a855f7" />
            <MetricCard label="Active Users" value={fmtNum(data.overview.activeUsers)} sub={`${fmtNum(data.overview.newUsers)} new`} color="#22d3ee" />
            <MetricCard label="Page Views"  value={fmtNum(data.overview.screenPageViews)}                     color="#4ade80" />
            <MetricCard label="Bounce Rate" value={`${data.overview.bounceRate.toFixed(1)}%`}                 color="#fb923c" />
            <MetricCard label="Avg Session" value={fmtDuration(data.overview.averageSessionDuration)}         color="#f472b6" />
          </div>

          {/* Area fill gradients */}
          <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <defs>
              <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#a855f7" stopOpacity={0.7} />
                <stop offset="70%"  stopColor="#a855f7" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.6} />
                <stop offset="70%"  stopColor="#22d3ee" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPageViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#4ade80" stopOpacity={0.55} />
                <stop offset="70%"  stopColor="#4ade80" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>

          {/* Trend chart */}
          <SectionCard title={`Sessions & Users — Last ${days} Days`} style={{ marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.trend} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.07)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: 12 }} />
                <Area type="monotone" dataKey="sessions"  stroke="#a855f7" strokeWidth={2} strokeOpacity={0.8} fill="url(#gradSessions)"  dot={false} name="Sessions" />
                <Area type="monotone" dataKey="users"     stroke="#22d3ee" strokeWidth={2} strokeOpacity={0.8} fill="url(#gradUsers)"     dot={false} name="Users" />
                <Area type="monotone" dataKey="pageViews" stroke="#4ade80" strokeWidth={2} strokeOpacity={0.7} fill="url(#gradPageViews)" dot={false} name="Page Views" />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Row: Channels + Devices */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <SectionCard title="Traffic Channels">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.channels} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                  <YAxis type="category" dataKey="channel" width={100} tick={{ fontSize: 11, fill: 'var(--txt-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sessions" name="Sessions" radius={[0, 8, 8, 0]} background={{ fill: 'rgba(128,128,128,0.06)', radius: 8 }}>
                    {data.channels.map((_, idx) => {
                      const g = GLASS[idx % GLASS.length];
                      return <Cell key={idx} fill={g.base} fillOpacity={0.7} stroke="none" />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Devices">
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={data.devices} dataKey="sessions" nameKey="device" cx="50%" cy="50%" innerRadius={50} outerRadius={84} paddingAngle={5} stroke="none">
                      {data.devices.map((_, idx) => {
                        const g = GLASS[idx % GLASS.length];
                        return <Cell key={idx} fill={g.base} fillOpacity={0.72} />;
                      })}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {data.devices.map((d, idx) => {
                    const g = GLASS[idx % GLASS.length];
                    return (
                      <div key={d.device} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.base, flexShrink: 0, boxShadow: `0 0 6px ${g.base}` }} />
                        <span style={{ color: 'var(--txt-muted)', textTransform: 'capitalize', flex: 1 }}>{d.device}</span>
                        <span style={{ color: 'var(--txt-pure)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{d.percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Row: Top pages + Top countries */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <SectionCard title="Top Pages">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {data.topPages.slice(0, 8).map((page, i) => {
                  const maxViews = data.topPages[0]?.views || 1;
                  const pct = (page.views / maxViews) * 100;
                  const g = GLASS[i % GLASS.length];
                  return (
                    <div key={i} style={{ padding: '9px 0', borderBottom: i < data.topPages.length - 1 ? '1px solid rgba(128,128,128,0.08)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--txt-pure)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                          {page.page}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--txt-muted)', fontWeight: 500, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmtNum(page.views)}
                        </span>
                      </div>
                      <div style={{ height: 7, background: 'rgba(128,128,128,0.06)', borderRadius: 99 }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: g.base, opacity: 0.7 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Top Countries">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.countries.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                  <YAxis type="category" dataKey="country" width={90} tick={{ fontSize: 11, fill: 'var(--txt-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sessions" name="Sessions" radius={[0, 8, 8, 0]} background={{ fill: 'rgba(128,128,128,0.06)', radius: 8 }}>
                    {data.countries.slice(0, 8).map((_, idx) => {
                      const g = GLASS[idx % GLASS.length];
                      return <Cell key={idx} fill={g.base} fillOpacity={0.7} stroke="none" />;
                    })}
                  </Bar>
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

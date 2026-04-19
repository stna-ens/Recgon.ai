'use client';

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { demoAnalytics } from '../mockData';

// ─── Constants (mirrors analytics/page.tsx) ───────────────────────────────────

const GLASS = [
  { base: '#a855f7' },
  { base: '#22d3ee' },
  { base: '#4ade80' },
  { base: '#fb923c' },
  { base: '#f472b6' },
  { base: '#60a5fa' },
  { base: '#facc15' },
  { base: '#34d399' },
];

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
  const parts = iso.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
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

// ─── Main pane ────────────────────────────────────────────────────────────────

export default function AnalyticsPane() {
  const { overview, trend, channels, topPages, devices, countries, insights } = demoAnalytics;

  const perfColor = PERF_COLOR[insights.overallPerformance] ?? '#86868b';
  const perfLabel = PERF_LABEL[insights.overallPerformance] ?? insights.overallPerformance;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 4, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '-0.5px' }}>
          <span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>analytics
        </h1>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace", marginBottom: 16 }}>
          property <code style={{ color: 'var(--signature)', fontSize: '0.8rem' }}>acme-labs-prod</code> · TaskSurge · fetched just now
        </p>

        {/* Toolbar strip */}
        <div style={{
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
          <span style={{ fontSize: '0.85rem', color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>TaskSurge</span>
          <div style={{ width: 1, height: 22, background: 'var(--btn-secondary-border)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg-deep)', border: '1px solid var(--btn-secondary-border)', borderRadius: 10, padding: 3 }}>
              {[{ label: '7 days', v: 7 }, { label: '30 days', v: 30 }, { label: '90 days', v: 90 }].map((opt) => (
                <button
                  key={opt.v}
                  style={{
                    padding: '5px 13px',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'default',
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    background: opt.v === 30 ? 'var(--btn-primary-bg)' : 'transparent',
                    color: opt.v === 30 ? 'var(--btn-primary-txt)' : 'var(--txt-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SVG gradient defs */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          <linearGradient id="demo-gradSessions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#a855f7" stopOpacity={0.7} />
            <stop offset="70%"  stopColor="#a855f7" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="demo-gradUsers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.6} />
            <stop offset="70%"  stopColor="#22d3ee" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="demo-gradPageViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4ade80" stopOpacity={0.55} />
            <stop offset="70%"  stopColor="#4ade80" stopOpacity={0.1} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard label="Sessions"     value={fmtNum(overview.sessions)}           color="#a855f7" />
        <MetricCard label="Active Users" value={fmtNum(overview.activeUsers)}        color="#22d3ee" sub={`${fmtNum(overview.newUsers)} new`} />
        <MetricCard label="Page Views"   value={fmtNum(overview.screenPageViews)}    color="#4ade80" />
        <MetricCard label="Bounce Rate"  value={`${overview.bounceRate.toFixed(1)}%`} color="#fb923c" />
        <MetricCard label="Avg Session"  value={fmtDuration(overview.averageSessionDuration)} color="#f472b6" />
      </div>

      {/* Trend chart */}
      <SectionCard title="Sessions & Users — Last 30 Days" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.07)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: 12 }} />
            <Area type="monotone" dataKey="sessions"  stroke="#a855f7" strokeWidth={2} strokeOpacity={0.8} fill="url(#demo-gradSessions)"  dot={false} name="Sessions" />
            <Area type="monotone" dataKey="users"     stroke="#22d3ee" strokeWidth={2} strokeOpacity={0.8} fill="url(#demo-gradUsers)"     dot={false} name="Users" />
            <Area type="monotone" dataKey="pageViews" stroke="#4ade80" strokeWidth={2} strokeOpacity={0.7} fill="url(#demo-gradPageViews)" dot={false} name="Page Views" />
          </AreaChart>
        </ResponsiveContainer>
      </SectionCard>

      {/* Row: Channels + Devices */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <SectionCard title="Traffic Channels">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channels} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
              <YAxis type="category" dataKey="channel" width={100} tick={{ fontSize: 11, fill: 'var(--txt-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="sessions" name="Sessions" radius={[0, 8, 8, 0]} background={{ fill: 'rgba(128,128,128,0.06)', radius: 8 }}>
                {channels.map((_, idx) => (
                  <Cell key={idx} fill={GLASS[idx % GLASS.length].base} fillOpacity={0.7} stroke="none" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Devices">
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={devices} dataKey="sessions" nameKey="device" cx="50%" cy="50%" innerRadius={50} outerRadius={84} paddingAngle={5} stroke="none">
                  {devices.map((_, idx) => (
                    <Cell key={idx} fill={GLASS[idx % GLASS.length].base} fillOpacity={0.72} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {devices.map((d, idx) => (
                <div key={d.device} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: GLASS[idx % GLASS.length].base, flexShrink: 0, boxShadow: `0 0 6px ${GLASS[idx % GLASS.length].base}` }} />
                  <span style={{ color: 'var(--txt-muted)', textTransform: 'capitalize', flex: 1 }}>{d.device}</span>
                  <span style={{ color: 'var(--txt-pure)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{d.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Row: Top Pages + Countries */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <SectionCard title="Top Pages">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {topPages.map((page, i) => {
              const maxViews = topPages[0]?.views || 1;
              const pct = (page.views / maxViews) * 100;
              const g = GLASS[i % GLASS.length];
              return (
                <div key={i} style={{ padding: '9px 0', borderBottom: i < topPages.length - 1 ? '1px solid rgba(128,128,128,0.08)' : 'none' }}>
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
            <BarChart data={countries} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-faint)' }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
              <YAxis type="category" dataKey="country" width={100} tick={{ fontSize: 11, fill: 'var(--txt-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="sessions" name="Sessions" radius={[0, 8, 8, 0]} background={{ fill: 'rgba(128,128,128,0.06)', radius: 8 }}>
                {countries.map((_, idx) => (
                  <Cell key={idx} fill={GLASS[idx % GLASS.length].base} fillOpacity={0.7} stroke="none" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Recgon Insights panel */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <span className="recgon-label">Recgon Insights</span>

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

        {/* Warnings */}
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

        {/* Opportunities */}
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

        {/* Recommendations */}
        <div>
          <span className="recgon-label">recommendations</span>
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.recommendations.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--txt-pure)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--signature)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                  {String(i + 1).padStart(2, '0')}.
                </span>
                {r}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

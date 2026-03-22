'use client';

import { useEffect, useRef, useState } from 'react';
import Select from '@/components/Select';
import MarketingPreview from '@/components/MarketingPreview';

// ── Types ────────────────────────────────────────────────────────────────────

type CampaignType =
  | 'product-launch'
  | 'brand-awareness'
  | 'lead-generation'
  | 'community-growth'
  | 're-engagement'
  | 'content-marketing';

type Tab = 'overview' | 'channels' | 'calendar' | 'metrics';
type Platform = 'instagram' | 'tiktok' | 'google-ads';

interface ContentCalendarItem {
  week: number;
  platform: string;
  contentType: string;
  topic: string;
  angle: string;
  cta: string;
  suggestedFormat: string;
}

interface CampaignPlan {
  campaignName: string;
  summary: string;
  targetAudience: {
    primary: string;
    secondary: string;
    painPoints: string[];
    motivations: string[];
  };
  keyMessages: string[];
  channels: Array<{
    platform: string;
    strategy: string;
    frequency: string;
    contentTypes: string[];
    estimatedReach: string;
  }>;
  phases: Array<{
    name: string;
    duration: string;
    objective: string;
    tactics: string[];
    keyDeliverables: string[];
  }>;
  contentCalendar: ContentCalendarItem[];
  kpis: Array<{ metric: string; target: string; platform: string; timeframe: string }>;
  budgetGuidance: {
    totalRecommendation: string;
    breakdown: Array<{ channel: string; percentage: number; rationale: string }>;
  };
  quickWins: string[];
}

interface Campaign {
  id: string;
  type: string;
  goal: string;
  duration: string;
  name: string;
  plan: CampaignPlan;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  analysis?: { name: string; description: string };
  campaigns?: Campaign[];
}

interface GeneratedContentEntry {
  content: Record<string, string>;
  platform: Platform;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CampaignIcon({ type, size = 20, color }: { type: CampaignType; size?: number; color?: string }) {
  const p = { width: size, height: size, fill: 'none', stroke: color ?? 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };
  switch (type) {
    case 'product-launch': return (
      <svg {...p}>
        <path d="M12 2C8 6.5 6.5 10.5 6.5 14a5.5 5.5 0 0 0 11 0c0-3.5-1.5-7.5-5.5-12z"/>
        <path d="M12 14v7"/>
        <path d="M9 18.5 6 21"/>
        <path d="M15 18.5 18 21"/>
      </svg>
    );
    case 'brand-awareness': return (
      <svg {...p}>
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
        <circle cx="12" cy="12" r="2"/>
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
        <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>
      </svg>
    );
    case 'lead-generation': return (
      <svg {...p}>
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    );
    case 'community-growth': return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    );
    case 're-engagement': return (
      <svg {...p}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
    );
    case 'content-marketing': return (
      <svg {...p}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    );
  }
}

// ── Campaign type config ──────────────────────────────────────────────────────

const CAMPAIGN_TYPES: Array<{
  id: CampaignType;
  label: string;
  description: string;
}> = [
  { id: 'product-launch',    label: 'Product Launch',    description: 'Announce and drive adoption of a new product or feature' },
  { id: 'brand-awareness',   label: 'Brand Awareness',   description: 'Build recognition and trust in your target market'        },
  { id: 'lead-generation',   label: 'Lead Generation',   description: 'Capture qualified leads and grow your pipeline'           },
  { id: 'community-growth',  label: 'Community Growth',  description: 'Build and engage a loyal community around your product'   },
  { id: 're-engagement',     label: 'Re-engagement',     description: 'Win back churned users or reactivate dormant leads'       },
  { id: 'content-marketing', label: 'Content Marketing', description: 'Establish thought leadership and drive organic growth'    },
];

const DURATIONS = [
  { value: '2 weeks', label: '2 Weeks' },
  { value: '1 month', label: '1 Month' },
  { value: '3 months', label: '3 Months' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlatformKey(name: string): Platform | null {
  const l = name.toLowerCase();
  if (l.includes('instagram')) return 'instagram';
  if (l.includes('tiktok') || l.includes('tik tok')) return 'tiktok';
  if (l.includes('google')) return 'google-ads';
  return null;
}

function platformBadgeColor(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('instagram')) return '#e1306c';
  if (l.includes('tiktok')) return '#2d2d2d';
  if (l.includes('google')) return '#4285f4';
  if (l.includes('linkedin')) return '#0a66c2';
  if (l.includes('twitter') || l.includes('x.com')) return '#1da1f2';
  if (l.includes('reddit')) return '#ff4500';
  if (l.includes('email')) return '#6366f1';
  if (l.includes('product hunt')) return '#da552f';
  return '#6b7280';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [campaignType, setCampaignType] = useState<CampaignType | null>(null);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [duration, setDuration] = useState('1 month');
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [generatingContent, setGeneratingContent] = useState<string | null>(null);
  const [generatedContents, setGeneratedContents] = useState<Record<string, GeneratedContentEntry>>({});
  const [contentErrors, setContentErrors] = useState<Record<string, string>>({});
  const [previewEntry, setPreviewEntry] = useState<GeneratedContentEntry | null>(null);
  const planRef = useRef<HTMLDivElement>(null);

  const loadProjects = () =>
    fetch('/api/projects')
      .then((r) => r.json())
      .then((ps: Project[]) => {
        const analyzed = ps.filter((p) => p.analysis);
        setProjects(analyzed);
        if (analyzed.length > 0 && !selectedProjectId) {
          setSelectedProjectId(analyzed[0].id);
        }
      })
      .catch(() => setProjects([]));

  useEffect(() => { loadProjects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const campaigns = selectedProject?.campaigns ?? [];
  const typeConfig = CAMPAIGN_TYPES.find((t) => t.id === campaignType) ?? null;;

  const handlePlan = async () => {
    if (!selectedProjectId) return;
    if (!campaignGoal.trim()) {
      setPlanError('A campaign goal is required. What do you want this campaign to achieve?');
      return;
    }
    setIsPlanning(true);
    setPlanError('');
    setActiveCampaign(null);
    try {
      const res = await fetch('/api/marketing/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, campaignType, goal: campaignGoal, duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Campaign planning failed');
      setActiveCampaign(data.campaign);
      setActiveTab('overview');
      setGeneratedContents({});
      setContentErrors({});
      loadProjects();
      setTimeout(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Campaign planning failed');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleGenerateContent = async (item: ContentCalendarItem, itemKey: string) => {
    const platform = getPlatformKey(item.platform);
    if (!platform || !selectedProjectId) return;
    setGeneratingContent(itemKey);
    setContentErrors((prev) => { const next = { ...prev }; delete next[itemKey]; return next; });
    try {
      const customPrompt = `Topic: ${item.topic}. Angle: ${item.angle}. Format: ${item.suggestedFormat}. CTA: ${item.cta}.`;
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, platform, customPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Content generation failed');
      setGeneratedContents((prev) => ({
        ...prev,
        [itemKey]: { content: data.content, platform },
      }));
    } catch (err) {
      setContentErrors((prev) => ({
        ...prev,
        [itemKey]: err instanceof Error ? err.message : 'Content generation failed',
      }));
    } finally {
      setGeneratingContent(null);
    }
  };

  // ── Render: setup ──────────────────────────────────────────────────────────

  const renderSetup = () => (
    <div className="glass-card" style={{ marginBottom: 32 }}>
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Project</label>
        <Select
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.analysis?.name ?? p.name }))}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Campaign Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {CAMPAIGN_TYPES.map((t) => {
            const selected = campaignType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCampaignType(t.id)}
                className="campaign-type-card"
                style={{
                  background: selected ? 'rgba(var(--signature-rgb), 0.08)' : 'var(--bg-content)',
                  border: `1.5px solid ${selected ? 'var(--signature)' : 'var(--btn-secondary-border)'}`,
                  boxShadow: selected ? '0 0 0 3px rgba(var(--signature-rgb), 0.12)' : 'none',
                  borderRadius: 12,
                  padding: '14px 12px',
                  textAlign: 'left',
                  outline: 'none',
                }}
              >
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: selected ? 'rgba(var(--signature-rgb), 0.12)' : 'var(--btn-secondary-bg)',
                  border: `1px solid ${selected ? 'rgba(var(--signature-rgb), 0.35)' : 'var(--btn-secondary-border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                  color: selected ? 'var(--signature)' : 'var(--txt-muted)',
                  transition: 'color 0.15s, background 0.15s, border-color 0.15s',
                }}>
                  <CampaignIcon type={t.id} size={17} />
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: selected ? 'var(--signature)' : 'var(--txt-pure)',
                  marginBottom: 3,
                  letterSpacing: '-0.2px',
                  transition: 'color 0.15s',
                }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.35 }}>{t.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Campaign Goal</label>
        <textarea
          className="form-textarea"
          placeholder="e.g. Get 500 signups in the first month, reach 1000 Instagram followers, generate 50 qualified leads..."
          value={campaignGoal}
          onChange={(e) => { setCampaignGoal(e.target.value); if (planError) setPlanError(''); }}
          rows={2}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 24 }}>
        <label className="form-label">Duration</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {DURATIONS.map((d) => {
            const selected = duration === d.value;
            return (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className="duration-pill"
                style={{
                  padding: '8px 20px',
                  borderRadius: 999,
                  border: `1.5px solid ${selected ? 'var(--signature)' : 'var(--btn-secondary-border)'}`,
                  background: selected ? 'rgba(var(--signature-rgb), 0.12)' : 'var(--bg-content)',
                  color: selected ? 'var(--signature)' : 'var(--txt-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {planError && (
        <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" fill="none" stroke="var(--danger)" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ color: 'var(--danger)', fontSize: 13, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>! {planError}</span>
        </div>
      )}

      <button
        className="btn btn-primary btn-lg"
        onClick={handlePlan}
        disabled={isPlanning || !selectedProjectId || !campaignType}
        style={{ width: '100%', justifyContent: 'center', gap: 10 }}
      >
        {isPlanning ? (
          <>
            <svg className="loader-spinner" style={{ width: 16, height: 16, borderRightColor: 'transparent', borderWidth: 2 }} />
            Planning campaign...
          </>
        ) : (
          <>
            {campaignType && <CampaignIcon type={campaignType} size={16} color="currentColor" />}
            {typeConfig ? `Plan ${typeConfig.label} Campaign` : 'Select a Campaign Type'}
          </>
        )}
      </button>
    </div>
  );

  // ── Render: campaign plan ──────────────────────────────────────────────────

  const renderPlan = (campaign: Campaign) => {
    const plan = campaign.plan;
    const ct = CAMPAIGN_TYPES.find((t) => t.id === campaign.type) ?? CAMPAIGN_TYPES[0];
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'channels', label: 'Channels' },
      { id: 'calendar', label: 'Content Calendar' },
      { id: 'metrics', label: 'Metrics & Budget' },
    ];

    return (
      <div ref={planRef} style={{ marginBottom: 40 }}>
        {/* Campaign header */}
        <div className="glass-card" style={{ marginBottom: 0, borderColor: 'var(--signature)', background: 'rgba(var(--signature-rgb), 0.04)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(var(--signature-rgb), 0.12)', border: '1px solid rgba(var(--signature-rgb), 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <CampaignIcon type={ct.id} size={20} color={'var(--signature)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 0 }}>{ct.label.toLowerCase()}</span>
                  <span style={{ fontSize: 11, color: 'var(--txt-muted)', background: 'var(--btn-secondary-bg)', padding: '1px 7px', borderRadius: 4, border: '1px solid var(--btn-secondary-border)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{campaign.duration}</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--txt-pure)', marginBottom: 5, letterSpacing: '-0.5px' }}>
                  {plan.campaignName}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {plan.summary}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveCampaign(null)}
              className="inline-btn"
              style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--txt-muted)', padding: '6px 8px', flexShrink: 0 }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--btn-secondary-border)', marginBottom: 20, padding: '0 32px', background: 'var(--bg-content)', backdropFilter: 'blur(20px)' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="campaign-tab-btn"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === t.id ? 'var(--signature)' : 'transparent'}`,
                color: activeTab === t.id ? 'var(--signature)' : 'var(--txt-muted)',
                fontWeight: activeTab === t.id ? 600 : 400,
                fontSize: 13,
                padding: '10px 14px',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="glass-card">
              <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 12 }}>target_audience</span>
              <p style={{ margin: '0 0 3px', fontSize: 13, color: 'var(--txt-pure)', fontWeight: 600 }}>{plan.targetAudience.primary}</p>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{plan.targetAudience.secondary}</p>

              <div style={{ marginBottom: 12 }}>
                <span className="recgon-label" style={{ color: 'var(--txt-muted)', marginBottom: 6 }}>pain_points</span>
                {plan.targetAudience.painPoints.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                    <svg width="12" height="12" fill="none" stroke="#ef4444" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p}</span>
                  </div>
                ))}
              </div>

              <div>
                <span className="recgon-label" style={{ color: 'var(--txt-muted)', marginBottom: 6 }}>motivations</span>
                {plan.targetAudience.motivations.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                    <svg width="12" height="12" fill="none" stroke="#22c55e" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{m}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="glass-card">
                <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 12 }}>key_messages</span>
                {plan.keyMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--signature)', background: 'rgba(var(--signature-rgb), 0.12)', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{m}</span>
                  </div>
                ))}
              </div>

              <div className="glass-card" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <svg width="13" height="13" fill="none" stroke="#f59e0b" strokeWidth="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <span className="recgon-label" style={{ color: '#f59e0b', marginBottom: 0 }}>quick_wins &lt;48h</span>
                </div>
                {plan.quickWins.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
                    <svg width="12" height="12" fill="none" stroke="#f59e0b" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Channels */}
        {activeTab === 'channels' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.channels.map((ch, i) => (
              <div key={i} className="glass-card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: platformBadgeColor(ch.platform), color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5 }}>{ch.platform}</span>
                    <span style={{ fontSize: 11, color: 'var(--txt-muted)', background: 'var(--btn-secondary-bg)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--btn-secondary-border)' }}>{ch.frequency}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>~{ch.estimatedReach}</span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ch.strategy}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ch.contentTypes.map((type, j) => (
                    <span key={j} style={{ fontSize: 11, color: 'var(--txt-muted)', background: 'var(--btn-secondary-bg)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--btn-secondary-border)' }}>{type}</span>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 6 }}>
              <span className="recgon-label" style={{ marginBottom: 10 }}>Campaign Phases</span>
              {plan.phases.map((phase, i) => (
                <div key={i} className="glass-card" style={{ marginBottom: 10, padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--signature)', background: 'rgba(var(--signature-rgb), 0.09)', padding: '2px 9px', borderRadius: 4 }}>{phase.duration}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt-pure)', letterSpacing: '-0.3px' }}>{phase.name}</span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>{phase.objective}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>tactics</div>
                      {phase.tactics.map((tactic, j) => (
                        <div key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${'var(--signature)'}50` }}>{tactic}</div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>deliverables</div>
                      {phase.keyDeliverables.map((d, j) => (
                        <div key={j} style={{ display: 'flex', gap: 5, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          <svg width="10" height="10" fill="none" stroke={'var(--signature)'} strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Content Calendar */}
        {activeTab === 'calendar' && (
          <div>
            {Array.from(new Set(plan.contentCalendar.map((item) => item.week))).sort((a, b) => a - b).map((week) => {
              const items = plan.contentCalendar.filter((item) => item.week === week);
              return (
                <div key={week} style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '0.04em' }}>week_{week}</div>
                    <div style={{ flex: 1, height: 1, background: 'var(--btn-secondary-border)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {items.map((item, idx) => {
                      const itemKey = `${campaign.id}-w${week}-${idx}`;
                      const supportedPlatform = getPlatformKey(item.platform);
                      const generated = generatedContents[itemKey];
                      const isGenerating = generatingContent === itemKey;
                      const contentError = contentErrors[itemKey];

                      return (
                        <div key={itemKey} className="glass-card calendar-card" style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span style={{ background: platformBadgeColor(item.platform), color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{item.platform}</span>
                                <span style={{ fontSize: 10, color: 'var(--txt-muted)', background: 'var(--btn-secondary-bg)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--btn-secondary-border)' }}>{item.contentType}</span>
                                <span style={{ fontSize: 10, color: 'var(--signature)', background: `${'var(--signature)'}14`, padding: '2px 7px', borderRadius: 4 }}>{item.suggestedFormat}</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-pure)', marginBottom: 2, letterSpacing: '-0.2px' }}>{item.topic}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 2 }}>{item.angle}</div>
                              <div style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}><span style={{ opacity: 0.6 }}>cta:</span> {item.cta}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                              {generated && (
                                <button
                                  onClick={() => setPreviewEntry(generated)}
                                  className="inline-btn"
                                  style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 7, padding: '5px 10px', fontSize: 11, color: 'var(--txt-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}
                                >
                                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  Preview
                                </button>
                              )}
                              {supportedPlatform ? (
                                <button
                                  onClick={() => handleGenerateContent(item, itemKey)}
                                  disabled={isGenerating}
                                  className="inline-btn"
                                  style={{
                                    background: generated ? `${'var(--signature)'}14` : 'var(--signature)',
                                    border: `1px solid ${generated ? 'rgba(var(--signature-rgb), 0.25)' : 'var(--signature)'}`,
                                    borderRadius: 7,
                                    padding: '5px 11px',
                                    fontSize: 11,
                                    color: generated ? 'var(--signature)' : '#fff',
                                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontWeight: 600,
                                    opacity: isGenerating ? 0.7 : 1,
                                    whiteSpace: 'nowrap' as const,
                                  }}
                                >
                                  {isGenerating ? (
                                    <>
                                      <svg className="loader-spinner" style={{ width: 10, height: 10, borderRightColor: 'transparent', borderWidth: 1.5 }} />
                                      Generating...
                                    </>
                                  ) : generated ? (
                                    <>
                                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                      Regenerate
                                    </>
                                  ) : (
                                    <>Generate</>
                                  )}
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>manual</span>
                              )}
                            </div>
                          </div>
                          {contentError && (
                            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <svg width="11" height="11" fill="none" stroke="var(--danger)" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                              <span style={{ fontSize: 11, color: 'var(--danger)' }}>{contentError}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Metrics & Budget */}
        {activeTab === 'metrics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="glass-card">
              <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 14 }}>kpis</span>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--btn-secondary-border)' }}>
                      {['Metric', 'Target', 'Platform', 'Timeframe'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--txt-muted)', fontWeight: 600, fontSize: 11, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{h.toLowerCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.kpis.map((kpi, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--btn-secondary-border)' }}>
                        <td style={{ padding: '9px 10px', color: 'var(--txt-pure)', fontWeight: 500 }}>{kpi.metric}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--signature)', fontWeight: 700, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{kpi.target}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{kpi.platform}</td>
                        <td style={{ padding: '9px 10px', color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{kpi.timeframe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass-card">
              <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 4 }}>budget_guidance</span>
              <p style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 700, color: 'var(--txt-pure)', letterSpacing: '-0.5px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{plan.budgetGuidance.totalRecommendation}</p>
              {plan.budgetGuidance.breakdown.map((b, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-pure)' }}>{b.channel}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--signature)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{b.percentage}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--btn-secondary-border)', borderRadius: 999, marginBottom: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${b.percentage}%`, background: 'var(--signature)', borderRadius: 999, transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{b.rationale}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: history ────────────────────────────────────────────────────────

  const renderHistory = () => {
    if (campaigns.length === 0) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => setHistoryExpanded((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', fontSize: 13, fontWeight: 500, padding: 0, marginBottom: 10, transition: 'color 0.15s' }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            style={{ transform: historyExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>// past_campaigns ({campaigns.length})</span>
        </button>
        {historyExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {campaigns.map((c) => {
              const ctConf = CAMPAIGN_TYPES.find((t) => t.id === c.type);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCampaign(c);
                    setActiveTab('overview');
                    setGeneratedContents({});
                    setTimeout(() => planRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                  }}
                  className="history-campaign-btn glass-card"
                  style={{ textAlign: 'left', border: '1px solid var(--btn-secondary-border)', background: 'var(--bg-content)', padding: '12px 16px', borderRadius: 12, width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: ctConf ? 'rgba(var(--signature-rgb), 0.09)' : 'var(--btn-secondary-bg)', border: `1px solid ${ctConf ? 'rgba(var(--signature-rgb), 0.2)' : 'var(--btn-secondary-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: ctConf ? 'var(--signature)' : 'var(--txt-muted)' }}>
                      {ctConf ? <CampaignIcon type={ctConf.id} size={14} color="var(--signature)" /> : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-pure)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginTop: 1, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{ctConf?.label} · {c.duration} · {new Date(c.createdAt).toLocaleDateString()}</div>
                    </div>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--txt-muted)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  if (projects.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>marketing agent</h2>
          <p>Recgon plans your campaigns — you execute them</p>
        </div>
        <div className="empty-state animate-fade-up" style={{ marginTop: '8vh' }}>
          <span className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
          </span>
          <h3>No analyzed projects</h3>
          <p>Analyze a project first to start planning marketing campaigns</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>marketing agent</h2>
        <p>Recgon plans your campaigns — you execute them</p>
      </div>

      {renderSetup()}
      {activeCampaign && renderPlan(activeCampaign)}
      {renderHistory()}

      {/* Preview modal */}
      {previewEntry && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setPreviewEntry(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                onClick={() => setPreviewEntry(null)}
                className="inline-btn"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 14px', fontSize: 13, fontWeight: 500 }}
              >
                Close
              </button>
            </div>
            <MarketingPreview platform={previewEntry.platform} content={previewEntry.content} />
          </div>
        </div>
      )}
    </div>
  );
}

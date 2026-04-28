'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTeam } from '@/components/TeamProvider';
import { createPortal } from 'react-dom';
import Modal from '@/components/Modal';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';

interface Competitor {
  name: string;
  url?: string;
  differentiator: string;
}

interface CompetitorInsight {
  name: string;
  url?: string;
  summary: string;
  positioning: string;
  messagingTone: string;
  keyFeatures: string[];
  weaknesses: string[];
  differentiator: string;
}

interface SWOT {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

interface ProductAnalysis {
  // Always present (legacy fields)
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  analyzedAt: string;
  // New PM mentor fields (optional for backward compat with old analyses)
  problemStatement?: string;
  marketOpportunity?: string;
  competitors?: Competitor[];
  competitorInsights?: CompetitorInsight[];
  businessModel?: string;
  revenueStreams?: string[];
  pricingSuggestion?: string;
  currentStage?: 'idea' | 'mvp' | 'beta' | 'growth' | 'mature';
  swot?: SWOT;
  topRisks?: string[];
  prioritizedNextSteps?: string[];
  gtmStrategy?: string;
  earlyAdopterChannels?: string[];
  growthMetrics?: string[];
  improvements?: string[];
  nextStepsTaken?: { step: string; taken: boolean; evidence: string }[];
}

interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  url: string;
}

interface Project {
  id: string;
  name: string;
  createdBy?: string;
  path?: string;
  sourceType?: 'codebase' | 'github' | 'description';
  description?: string;
  isGithub?: boolean;
  githubUrl?: string;
  lastAnalyzedCommitSha?: string;
  isShared?: boolean;
  createdAt: string;
  analysis?: ProductAnalysis;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  idea:    { label: 'Idea',        color: '#8b5cf6' },
  mvp:     { label: 'MVP',         color: '#f59e0b' },
  beta:    { label: 'Beta',        color: '#3b82f6' },
  growth:  { label: 'Growth',      color: '#10b981' },
  mature:  { label: 'Mature',      color: '#6b7280' },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <span className="recgon-label">{children}</span>;
}

function BulletList({ items, accent }: { items: string[]; accent?: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10, paddingLeft: 20, position: 'relative', lineHeight: 1.6 }}>
          <span style={{ position: 'absolute', left: 0, color: accent ?? 'var(--accent-secondary)', fontWeight: 700 }}>›</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, paddingLeft: 28, position: 'relative', lineHeight: 1.6 }}>
          <span style={{ position: 'absolute', left: 0, color: 'var(--accent-secondary)', fontWeight: 700, fontSize: 12 }}>{i + 1}.</span>
          {item}
        </li>
      ))}
    </ol>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentTeam, refreshProjects } = useTeam();
  const { data: session } = useSession();
  const [project, setProject] = useState<Project | null>(null);
  const [togglingShared, setTogglingShared] = useState(false);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [latestCommit, setLatestCommit] = useState<CommitInfo | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [connectingCodebase, setConnectingCodebase] = useState(false);
  const [codebasePath, setCodebasePath] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [quota, setQuota] = useState<{ allowed: boolean; used: number; limit: number; reason?: string; nextAvailableAt?: string } | null>(null);

  const fetchProject = useCallback(() => {
    if (!currentTeam) return;
    fetch(`/api/projects/${params.id}?teamId=${currentTeam.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((p: Project) => {
        setProject(p);
        if (p.isGithub && p.analysis && p.lastAnalyzedCommitSha) {
          fetch(`/api/projects/${params.id}/check-updates?teamId=${currentTeam.id}`)
            .then((r) => r.ok ? r.json() : { hasUpdates: false })
            .then((data) => {
              setHasUpdates(data.hasUpdates);
              if (data.hasUpdates && data.commit) setLatestCommit(data.commit);
            })
            .catch(() => {});
        }
      })
      .catch(() => router.push('/projects'));
  }, [params.id, router, currentTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Fetch analysis quota on mount
  useEffect(() => {
    fetch('/api/analysis-quota')
      .then((r) => r.ok ? r.json() : null)
      .then((q) => { if (q) setQuota(q); })
      .catch(() => {});
  }, []);

  // Refetch when tab regains visibility so teammates' changes appear without a full reload
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchProject(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchProject]);

  const quotaBlocked = quota !== null && !quota.allowed;

  const handleAnalyze = async () => {
    if (quotaBlocked) return;
    setAnalyzing(true);
    setError('');
    setProgressMessage('Starting analysis...');
    try {
      const res = await fetch(`/api/projects/${params.id}/analyze`, {
        method: 'POST',
        headers: { 'x-team-id': currentTeam?.id || '' },
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        // If blocked by quota, refresh the quota state for the UI
        if (res.status === 429 && (data as { quota?: typeof quota }).quota) {
          setQuota((data as { quota: typeof quota }).quota);
        }
        throw new Error((data as { error?: string }).error || 'Analysis failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const dataLine = line.startsWith('data: ') ? line.slice(6) : line;
          if (!dataLine.trim()) continue;
          try {
            const event = JSON.parse(dataLine);
            if (event.type === 'progress') setProgressMessage(event.message);
            else if (event.type === 'done') {
              setProject(event.project); setHasUpdates(false); setLatestCommit(null); refreshProjects();
              // Refresh quota after successful analysis
              fetch('/api/analysis-quota').then(r => r.ok ? r.json() : null).then(q => { if (q) setQuota(q); }).catch(() => {});
            }
            else if (event.type === 'error') throw new Error(event.message);
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
      setProgressMessage('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this project?')) return;
    await fetch(`/api/projects/${params.id}?teamId=${currentTeam?.id}`, { method: 'DELETE' });
    router.push('/projects');
  };

  const handleToggleShared = async () => {
    if (!project || togglingShared) return;
    const next = !(project.isShared ?? true);
    setTogglingShared(true);
    try {
      const res = await fetch(`/api/projects/${params.id}?teamId=${currentTeam?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isShared: next }),
      });
      if (res.ok) {
        setProject({ ...project, isShared: next });
        refreshProjects();
      }
    } finally {
      setTogglingShared(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!draftDescription.trim() || !project) return;
    setError('');
    const res = await fetch(`/api/projects/${params.id}?teamId=${currentTeam?.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: draftDescription }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error || 'Failed to save description');
      return;
    }
    setProject({ ...project, description: draftDescription });
    setEditingDescription(false);
    handleAnalyze();
  };

  const handleConnectCodebase = async () => {
    if (!codebasePath.trim() || !project) return;
    setConnectLoading(true);
    setError('');
    const res = await fetch(`/api/projects/${params.id}?teamId=${currentTeam?.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: codebasePath }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error || 'Failed to connect codebase');
      setConnectLoading(false);
      return;
    }
    const isGithub = codebasePath.startsWith('https://github.com/');
    setProject({
      ...project,
      path: codebasePath,
      sourceType: isGithub ? 'github' : 'description',
      isGithub,
    });
    setConnectingCodebase(false);
    setCodebasePath('');
    setConnectLoading(false);
    handleAnalyze();
  };

  if (!project) {
    return (
      <div className="loader">
        <div className="loader-spinner" />
        <div className="loader-text">Loading project...</div>
      </div>
    );
  }

  const a = project.analysis;
  const stage = a?.currentStage ? STAGE_LABELS[a.currentStage] : null;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px', fontFamily: "'JetBrains Mono', ui-monospace, monospace", whiteSpace: 'nowrap' }}><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>{project.name.toLowerCase()}</h2>
            {stage && project.sourceType !== 'description' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}55`, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                {stage.label}
              </span>
            )}
            {project.sourceType === 'description' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                Idea
              </span>
            )}
            {project.sourceType !== 'description' && hasUpdates && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,159,10,0.08)', color: 'var(--warning)', border: '1px solid rgba(255,159,10,0.3)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", flexShrink: 0 }}>
                ! new commits
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {project.sourceType === 'description' && (
              <>
                <button
                  className="btn btn-secondary"
                  title="Edit idea description"
                  onClick={() => { setDraftDescription(project.description ?? ''); setEditingDescription(true); }}
                  style={{ padding: '8px 10px' }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
                <button
                  className="btn btn-secondary"
                  title="Connect a codebase to this project"
                  onClick={() => setConnectingCodebase(true)}
                  style={{ padding: '8px 10px' }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing || quotaBlocked} title={quotaBlocked ? quota?.reason : undefined}>
              {analyzing ? (
                <><svg className="loader-spinner" style={{ width: 15, height: 15, borderRightColor: 'transparent', borderWidth: 2 }}></svg> Analyzing...</>
              ) : a ? (
                <><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg> {project.sourceType === 'description' ? 'Re-analyze' : 'Re-analyze'}</>
              ) : (
                <><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> {project.sourceType === 'description' ? 'Analyze Idea' : 'Analyze Repo'}</>
              )}
            </button>
            {a && (
              <button className="btn btn-secondary" onClick={() => router.push(`/projects/${params.id}/export`)}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export PDF
              </button>
            )}
            {session?.user?.id && project.createdBy === session.user.id && (
              <button
                className="btn btn-secondary"
                title={project.isShared === false
                  ? 'Private — only you can see this project. Click to share with your team.'
                  : 'Shared — all team members can see this project. Click to make it private.'}
                onClick={handleToggleShared}
                disabled={togglingShared}
                style={{ padding: '8px 10px' }}
              >
                {project.isShared === false ? (
                  // Lock (private)
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                ) : (
                  // Users (shared)
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                )}
              </button>
            )}
            <button className="btn btn-secondary" title="Delete project" onClick={handleDelete} style={{ padding: '8px 10px' }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Analysis Quota Banner ────────────────────────────────── */}
      {quota && (
        <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: quotaBlocked ? 'rgba(255,69,58,0.06)' : 'rgba(var(--signature-rgb), 0.06)', border: `1px solid ${quotaBlocked ? 'rgba(255,69,58,0.25)' : 'rgba(var(--signature-rgb), 0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="18" height="18" fill="none" stroke={quotaBlocked ? 'var(--danger)' : 'var(--signature)'} strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 6v6l4 2" /></svg>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: quotaBlocked ? 'var(--danger)' : 'var(--text-primary)' }}>
                {quotaBlocked ? quota.reason : `${quota.limit - quota.used} of ${quota.limit} analyses remaining`}
              </p>
              {!quotaBlocked && quota.used > 0 && quota.nextAvailableAt && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Next available: {new Date(quota.nextAvailableAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: quota.limit }).map((_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < quota.used ? (quotaBlocked ? 'var(--danger)' : 'var(--signature)') : 'var(--btn-secondary-bg)', border: `1px solid ${i < quota.used ? 'transparent' : 'var(--border)'}`, transition: 'background 0.3s' }} />
            ))}
          </div>
        </div>
      )}

      {project.sourceType !== 'description' && hasUpdates && !analyzing && (
        <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="18" height="18" fill="none" stroke="var(--warning)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--warning)' }}>New commit detected</p>
              {latestCommit && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                  {latestCommit.message}
                  {latestCommit.date && (
                    <span style={{ marginLeft: 10, opacity: 0.6 }}>{new Date(latestCommit.date).toLocaleDateString()}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={quotaBlocked} title={quotaBlocked ? quota?.reason : undefined} style={{ flexShrink: 0, fontSize: 13 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            See what changed
          </button>
        </div>
      )}

      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', marginBottom: 20 }}>
          <p style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            {error}
          </p>
        </div>
      )}

      {project && currentTeam && (
        <IntegrationsPanel projectId={project.id} teamId={currentTeam.id} />
      )}

      {analyzing && (
        <div className="loader">
          <div className="loader-spinner" />
          <div className="loader-text">{progressMessage || 'Starting analysis...'}</div>
        </div>
      )}

      {a && !analyzing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Product Overview ─────────────────────────────────────── */}
          <div className="glass-card">
            <SectionTitle>Product Overview</SectionTitle>
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{a.name}</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>{a.description}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
              <div>
                <span className="recgon-label">Target Audience</span>
                <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>{a.targetAudience}</p>
              </div>
              {a.problemStatement && (
                <div>
                  <span className="recgon-label">The Problem It Solves</span>
                  <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>{a.problemStatement}</p>
                </div>
              )}
            </div>

            <div>
              <span className="recgon-label">Tech Stack</span>
              <div className="tags-row">
                {a.techStack.map((tech) => (
                  <span key={tech} className="tag">{tech}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Features & USPs ──────────────────────────────────────── */}
          <div className="grid-2">
            <div className="glass-card">
              <SectionTitle>Key Features</SectionTitle>
              <BulletList items={a.features} accent="var(--accent-secondary)" />
            </div>
            <div className="glass-card">
              <SectionTitle>Unique Selling Points</SectionTitle>
              <BulletList items={a.uniqueSellingPoints} accent="var(--success)" />
            </div>
          </div>

          {/* ── Market Opportunity & Competitors ─────────────────────── */}
          {(a.marketOpportunity || (a.competitors?.length ?? 0) > 0) && (
          <div className="glass-card">
            <SectionTitle>Market Opportunity</SectionTitle>
            {a.marketOpportunity && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>{a.marketOpportunity}</p>
            )}
            {(a.competitors?.length ?? 0) > 0 && (
              <>
                <span className="recgon-label">Competitive Landscape</span>
                {a.competitorInsights?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {a.competitorInsights.map((c, i) => (
                      <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                          {c.url && (
                            <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--signature)', textDecoration: 'none', border: '1px solid var(--signature)', borderRadius: 4, padding: '1px 6px' }}>
                              Visit site
                            </a>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-muted)', background: 'var(--bg-content)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>
                            {c.messagingTone}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>{c.summary}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Their strengths</span>
                            <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px' }}>
                              {c.keyFeatures.map((f, j) => <li key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f}</li>)}
                            </ul>
                          </div>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Their gaps</span>
                            <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px' }}>
                              {c.weaknesses.map((w, j) => <li key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{w}</li>)}
                            </ul>
                          </div>
                        </div>
                        <div style={{ background: 'rgba(var(--signature-rgb), 0.07)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--signature)', fontStyle: 'italic' }}>
                          {c.differentiator}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {a.competitors?.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 120 }}>{c.name}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.differentiator}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* ── Business Model ───────────────────────────────────────── */}
          {(a.businessModel || a.revenueStreams?.length || a.pricingSuggestion) && (
          <div className="glass-card">
            <SectionTitle>Business Model</SectionTitle>
            {a.businessModel && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>{a.businessModel}</p>
            )}
            <div className="grid-2">
              {(a.revenueStreams?.length ?? 0) > 0 && (
                <div>
                  <span className="recgon-label">Revenue Streams</span>
                  <BulletList items={a.revenueStreams ?? []} />
                </div>
              )}
              {a.pricingSuggestion && (
                <div>
                  <span className="recgon-label">Pricing Suggestion</span>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{a.pricingSuggestion}</p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* ── SWOT ─────────────────────────────────────────────────── */}
          {a.swot && (
          <div className="glass-card">
            <SectionTitle>SWOT Analysis</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--success)' }}>
                <span className="recgon-label" style={{ color: 'var(--success)' }}>strengths</span>
                <BulletList items={a.swot.strengths ?? []} accent="var(--success)" />
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--danger)' }}>
                <span className="recgon-label" style={{ color: 'var(--danger)' }}>weaknesses</span>
                <BulletList items={a.swot.weaknesses ?? []} accent="var(--danger)" />
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--signature)' }}>
                <span className="recgon-label" style={{ color: 'var(--signature)' }}>opportunities</span>
                <BulletList items={a.swot.opportunities ?? []} accent="var(--signature)" />
              </div>
              <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--warning)' }}>
                <span className="recgon-label" style={{ color: 'var(--warning)' }}>threats</span>
                <BulletList items={a.swot.threats ?? []} accent="var(--warning)" />
              </div>
            </div>
          </div>
          )}

          {/* ── What improved since last push ───────────────────────── */}
          {(a.improvements?.length ?? 0) > 0 && (
          <div className="glass-card">
            <SectionTitle>What Improved Since Last Push</SectionTitle>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {a.improvements!.map((item, i) => (
                <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10, paddingLeft: 24, position: 'relative', lineHeight: 1.6 }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--success)', fontWeight: 700 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          )}

          {/* ── Recommendations feedback loop ────────────────────────── */}
          {(a.nextStepsTaken?.length ?? 0) > 0 && (() => {
            const taken = a.nextStepsTaken!.filter(s => s.taken).length;
            const total = a.nextStepsTaken!.length;
            const pct = Math.round((taken / total) * 100);
            return (
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <SectionTitle>Previous Recommendations — Acted On</SectionTitle>
                  <span style={{ fontSize: 13, fontWeight: 700, color: pct >= 60 ? 'var(--success)' : pct >= 30 ? 'var(--warning)' : 'var(--danger)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                    {taken}/{total} ({pct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {a.nextStepsTaken!.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, borderLeft: `3px solid ${s.taken ? 'var(--success)' : 'var(--btn-secondary-border)'}` }}>
                      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{s.taken ? '✓' : '○'}</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: s.taken ? 'var(--text-primary)' : 'var(--text-secondary)', margin: 0, marginBottom: 4 }}>{s.step}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>{s.evidence}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Action Plan ──────────────────────────────────────────── */}
          {((a.prioritizedNextSteps?.length ?? 0) > 0 || (a.topRisks?.length ?? 0) > 0) && (
          <div className="grid-2">
            {(a.prioritizedNextSteps?.length ?? 0) > 0 && (
              <div className="glass-card">
                <SectionTitle>Prioritized Next Steps</SectionTitle>
                <NumberedList items={a.prioritizedNextSteps ?? []} />
              </div>
            )}
            {(a.topRisks?.length ?? 0) > 0 && (
              <div className="glass-card">
                <SectionTitle>Top Risks</SectionTitle>
                <BulletList items={a.topRisks ?? []} accent="var(--danger)" />
              </div>
            )}
          </div>
          )}

          {/* ── Go-to-Market ─────────────────────────────────────────── */}
          {(a.gtmStrategy || (a.earlyAdopterChannels?.length ?? 0) > 0 || (a.growthMetrics?.length ?? 0) > 0) && (
          <div className="glass-card">
            <SectionTitle>Go-to-Market Strategy</SectionTitle>
            {a.gtmStrategy && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>{a.gtmStrategy}</p>
            )}
            <div className="grid-2">
              {(a.earlyAdopterChannels?.length ?? 0) > 0 && (
                <div>
                  <span className="recgon-label">Early Adopter Channels</span>
                  <BulletList items={a.earlyAdopterChannels ?? []} />
                </div>
              )}
              {(a.growthMetrics?.length ?? 0) > 0 && (
                <div>
                  <span className="recgon-label">Growth Metrics to Track</span>
                  <BulletList items={a.growthMetrics ?? []} />
                </div>
              )}
            </div>
          </div>
          )}

        </div>
      )}

      {!a && !analyzing && (
        <div className="empty-state">
          <span className="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </span>
          <h3>Ready to analyze</h3>
          <p>{project.sourceType === 'description' ? 'Click \u201cAnalyze Idea\u201d to get your full product strategy brief' : 'Click \u201cAnalyze Repo\u201d to get your full product strategy brief'}</p>
        </div>
      )}

      {/* Connect GitHub repo modal (upgrade idea → full code analysis) */}
      {connectingCodebase && typeof document !== 'undefined' && createPortal(
        <Modal
          open={connectingCodebase}
          onClose={() => setConnectingCodebase(false)}
          title="Connect GitHub Repo"
          description="Upgrade this idea project to a full code analysis by linking a GitHub repository. The existing idea analysis will be replaced."
        >
          <div className="form-group">
            <label className="form-label" htmlFor="github-url-input">GitHub URL</label>
            <input
              id="github-url-input"
              className="form-input"
              type="text"
              placeholder="https://github.com/user/repo"
              value={codebasePath}
              onChange={(e) => setCodebasePath(e.target.value)}
            />
          </div>
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => setConnectingCodebase(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleConnectCodebase}
              disabled={connectLoading || !codebasePath.trim()}
            >
              {connectLoading ? 'Connecting...' : 'Connect & Analyze'}
            </button>
          </div>
        </Modal>,
        document.body
      )}

      {/* Edit description modal */}
      <Modal
        open={editingDescription}
        onClose={() => setEditingDescription(false)}
        title="Edit Idea Description"
      >
        <div className="form-group">
          <label className="form-label" htmlFor="idea-desc-input">Description</label>
          <textarea
            id="idea-desc-input"
            className="form-input"
            rows={8}
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={() => setEditingDescription(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSaveDescription}
            disabled={!draftDescription.trim()}
          >
            Save & Re-analyze
          </button>
        </div>
      </Modal>
    </div>
  );
}

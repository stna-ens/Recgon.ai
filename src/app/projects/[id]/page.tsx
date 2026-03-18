'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Competitor {
  name: string;
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
  path: string;
  isGithub?: boolean;
  githubUrl?: string;
  lastAnalyzedCommitSha?: string;
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
  const [project, setProject] = useState<Project | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(setProject)
      .catch(() => router.push('/projects'));
  }, [params.id, router]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    setProgressMessage('Starting analysis...');
    try {
      const res = await fetch(`/api/projects/${params.id}/analyze`, { method: 'POST' });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
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
            else if (event.type === 'done') setProject(event.project);
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
    await fetch(`/api/projects/${params.id}`, { method: 'DELETE' });
    router.push('/projects');
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1px' }}>{project.name}</h2>
            {stage && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}55`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {stage.label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? (
                <><svg className="loader-spinner" style={{ width: 16, height: 16, borderRightColor: 'transparent', borderWidth: 2 }}></svg> Analyzing...</>
              ) : a ? (
                <><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg> Re-analyze</>
              ) : (
                <><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> Analyze Codebase</>
              )}
            </button>
            <button className="btn btn-secondary" onClick={handleDelete}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> Delete
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', marginBottom: 20 }}>
          <p style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            {error}
          </p>
        </div>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Audience</span>
                <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>{a.targetAudience}</p>
              </div>
              {a.problemStatement && (
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>The Problem It Solves</span>
                  <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>{a.problemStatement}</p>
                </div>
              )}
            </div>

            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'block' }}>Tech Stack</span>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'block' }}>Competitive Landscape</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {a.competitors?.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 120 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.differentiator}</span>
                    </div>
                  ))}
                </div>
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'block' }}>Revenue Streams</span>
                  <BulletList items={a.revenueStreams ?? []} />
                </div>
              )}
              {a.pricingSuggestion && (
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'block' }}>Pricing Suggestion</span>
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
              <div style={{ padding: '14px 16px', background: '#10b98115', borderRadius: 8, border: '1px solid #10b98130' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', display: 'block', marginBottom: 10 }}>STRENGTHS</span>
                <BulletList items={a.swot.strengths ?? []} accent="#10b981" />
              </div>
              <div style={{ padding: '14px 16px', background: '#ef444415', borderRadius: 8, border: '1px solid #ef444430' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', display: 'block', marginBottom: 10 }}>WEAKNESSES</span>
                <BulletList items={a.swot.weaknesses ?? []} accent="#ef4444" />
              </div>
              <div style={{ padding: '14px 16px', background: '#3b82f615', borderRadius: 8, border: '1px solid #3b82f630' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', display: 'block', marginBottom: 10 }}>OPPORTUNITIES</span>
                <BulletList items={a.swot.opportunities ?? []} accent="#3b82f6" />
              </div>
              <div style={{ padding: '14px 16px', background: '#f59e0b15', borderRadius: 8, border: '1px solid #f59e0b30' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', display: 'block', marginBottom: 10 }}>THREATS</span>
                <BulletList items={a.swot.threats ?? []} accent="#f59e0b" />
              </div>
            </div>
          </div>
          )}

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
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'block' }}>Early Adopter Channels</span>
                  <BulletList items={a.earlyAdopterChannels ?? []} />
                </div>
              )}
              {(a.growthMetrics?.length ?? 0) > 0 && (
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'block' }}>Growth Metrics to Track</span>
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
          <p>Click &quot;Analyze Codebase&quot; to get your full product strategy brief</p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { demoProjects, type DemoProject, type DemoAnalysis } from '../mockData';

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  idea:   { label: 'Idea',   color: '#8b5cf6' },
  mvp:    { label: 'MVP',    color: '#f59e0b' },
  beta:   { label: 'Beta',   color: '#3b82f6' },
  growth: { label: 'Growth', color: '#10b981' },
  mature: { label: 'Mature', color: '#6b7280' },
};

function BulletList({ items, accent }: { items: string[]; accent?: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, color: 'var(--txt-muted)', marginBottom: 10, paddingLeft: 20, position: 'relative', lineHeight: 1.6 }}>
          <span style={{ position: 'absolute', left: 0, color: accent ?? 'var(--signature)', fontWeight: 700 }}>›</span>
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
        <li key={i} style={{ fontSize: 14, color: 'var(--txt-muted)', marginBottom: 12, paddingLeft: 28, position: 'relative', lineHeight: 1.6 }}>
          <span style={{ position: 'absolute', left: 0, color: 'var(--signature)', fontWeight: 700, fontSize: 12 }}>{i + 1}.</span>
          {item}
        </li>
      ))}
    </ol>
  );
}

function ProjectCardMock({ project, onOpen }: { project: DemoProject; onOpen: () => void }) {
  return (
    <div onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div className="glass-card" style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--txt-pure)' }}>{project.name}</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {project.hasUpdates && (
              <span className="tag" style={{ color: 'var(--warning)', borderColor: 'rgba(255,159,10,0.3)', background: 'rgba(255,159,10,0.06)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
                ! new commits
              </span>
            )}
            <span className="tag" style={{ color: 'var(--signature)', borderColor: 'rgba(var(--signature-rgb), 0.3)', background: 'rgba(var(--signature-rgb), 0.05)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
              › analyzed
            </span>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--txt-pure)', lineHeight: 1.5, marginBottom: 12 }}>
          {project.description}
        </p>
        <div className="tags-row">
          {project.techStack.slice(0, 5).map((tech) => (
            <span key={tech} className="tag">{tech}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Detail({ project, onBack }: { project: DemoProject; onBack: () => void }) {
  const a: DemoAnalysis = project.analysis;
  const stage = STAGE_LABELS[a.currentStage];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              onClick={onBack}
              style={{ background: 'transparent', border: 'none', color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, cursor: 'pointer', padding: 0, marginRight: 4 }}
            >
              ←
            </button>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              <span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>{project.name.toLowerCase()}
            </h2>
            {stage && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}55`, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                {stage.label}
              </span>
            )}
            {project.hasUpdates && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,159,10,0.08)', color: 'var(--warning)', border: '1px solid rgba(255,159,10,0.3)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", flexShrink: 0 }}>
                ! new commits
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Product Overview */}
        <div className="glass-card">
          <span className="recgon-label">Product Overview</span>
          <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{a.name}</h3>
          <p style={{ fontSize: 15, color: 'var(--txt-muted)', lineHeight: 1.7, marginBottom: 20 }}>{a.description}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
            <div>
              <span className="recgon-label">Target Audience</span>
              <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6, color: 'var(--txt-muted)' }}>{a.targetAudience}</p>
            </div>
            <div>
              <span className="recgon-label">The Problem It Solves</span>
              <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6, color: 'var(--txt-muted)' }}>{a.problemStatement}</p>
            </div>
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

        {/* Features & USPs */}
        <div className="grid-2">
          <div className="glass-card">
            <span className="recgon-label">Key Features</span>
            <BulletList items={a.features} accent="var(--signature)" />
          </div>
          <div className="glass-card">
            <span className="recgon-label">Unique Selling Points</span>
            <BulletList items={a.uniqueSellingPoints} accent="var(--success)" />
          </div>
        </div>

        {/* Market Opportunity & Competitors */}
        <div className="glass-card">
          <span className="recgon-label">Market Opportunity</span>
          <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.7, marginBottom: 20 }}>{a.marketOpportunity}</p>

          <span className="recgon-label">Competitive Landscape</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {a.competitorInsights.map((c, i) => (
              <div key={i} style={{ background: 'var(--btn-secondary-bg)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--btn-secondary-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt-pure)' }}>{c.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-muted)', background: 'var(--bg-deep)', border: '1px solid var(--btn-secondary-border)', borderRadius: 4, padding: '2px 8px' }}>
                    {c.messagingTone}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6, marginBottom: 10 }}>{c.summary}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Their strengths</span>
                    <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px' }}>
                      {c.keyFeatures.map((f, j) => <li key={j} style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.5 }}>{f}</li>)}
                    </ul>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Their gaps</span>
                    <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px' }}>
                      {c.weaknesses.map((w, j) => <li key={j} style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.5 }}>{w}</li>)}
                    </ul>
                  </div>
                </div>
                <div style={{ background: 'rgba(var(--signature-rgb), 0.07)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--signature)', fontStyle: 'italic' }}>
                  {c.differentiator}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Business Model */}
        <div className="glass-card">
          <span className="recgon-label">Business Model</span>
          <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.7, marginBottom: 20 }}>{a.businessModel}</p>
          <div className="grid-2">
            <div>
              <span className="recgon-label">Revenue Streams</span>
              <BulletList items={a.revenueStreams} />
            </div>
            <div>
              <span className="recgon-label">Pricing Suggestion</span>
              <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.6 }}>{a.pricingSuggestion}</p>
            </div>
          </div>
        </div>

        {/* SWOT */}
        <div className="glass-card">
          <span className="recgon-label">SWOT Analysis</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--success)' }}>
              <span className="recgon-label" style={{ color: 'var(--success)' }}>strengths</span>
              <BulletList items={a.swot.strengths} accent="var(--success)" />
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--danger)' }}>
              <span className="recgon-label" style={{ color: 'var(--danger)' }}>weaknesses</span>
              <BulletList items={a.swot.weaknesses} accent="var(--danger)" />
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--signature)' }}>
              <span className="recgon-label" style={{ color: 'var(--signature)' }}>opportunities</span>
              <BulletList items={a.swot.opportunities} accent="var(--signature)" />
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--btn-secondary-bg)', borderRadius: 8, border: '1px solid var(--btn-secondary-border)', borderLeft: '3px solid var(--warning)' }}>
              <span className="recgon-label" style={{ color: 'var(--warning)' }}>threats</span>
              <BulletList items={a.swot.threats} accent="var(--warning)" />
            </div>
          </div>
        </div>

        {/* Action Plan */}
        <div className="grid-2">
          <div className="glass-card">
            <span className="recgon-label">Prioritized Next Steps</span>
            <NumberedList items={a.prioritizedNextSteps} />
          </div>
          <div className="glass-card">
            <span className="recgon-label">Top Risks</span>
            <BulletList items={a.topRisks} accent="var(--danger)" />
          </div>
        </div>

        {/* Go-to-Market */}
        <div className="glass-card">
          <span className="recgon-label">Go-to-Market Strategy</span>
          <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.7, marginBottom: 20 }}>{a.gtmStrategy}</p>
          <div className="grid-2">
            <div>
              <span className="recgon-label">Early Adopter Channels</span>
              <BulletList items={a.earlyAdopterChannels} />
            </div>
            <div>
              <span className="recgon-label">Growth Metrics to Track</span>
              <BulletList items={a.growthMetrics} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function ProjectsPane() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? demoProjects.find((p) => p.id === openId) : null;

  if (open) return <Detail project={open} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>project center</h2>
        <p>Add your products and let Recgon get to know them</p>
      </div>
      <div className="grid-2">
        {demoProjects.map((p) => (
          <ProjectCardMock key={p.id} project={p} onOpen={() => setOpenId(p.id)} />
        ))}
      </div>
    </div>
  );
}

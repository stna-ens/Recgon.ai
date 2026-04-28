'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';

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
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  analyzedAt: string;
  problemStatement?: string;
  marketOpportunity?: string;
  competitors?: Competitor[];
  competitorInsights?: CompetitorInsight[];
  businessModel?: string;
  revenueStreams?: string[];
  pricingSuggestion?: string;
  currentStage?: string;
  swot?: SWOT;
  topRisks?: string[];
  prioritizedNextSteps?: string[];
  gtmStrategy?: string;
  earlyAdopterChannels?: string[];
  growthMetrics?: string[];
  improvements?: string[];
  nextStepsTaken?: { step: string; taken: boolean; evidence: string }[];
}

interface Project {
  id: string;
  name: string;
  analysis?: ProductAnalysis;
}

/* ─── Design tokens ─── */
const C = {
  bg:      '#09090b',
  surface: 'rgba(255,255,255,0.03)',
  border:  'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  txt1:    '#f4f4f5',
  txt2:    '#a1a1aa',
  txt3:    '#71717a',
  brand:   '#e8a8c4',
  success: '#34d399',
  danger:  '#f87171',
  warning: '#fbbf24',
  blue:    '#60a5fa',
} as const;

const STAGE_META: Record<string, { color: string }> = {
  idea:   { color: '#fbbf24' },
  mvp:    { color: '#e8a8c4' },
  beta:   { color: '#60a5fa' },
  growth: { color: '#34d399' },
  mature: { color: '#71717a' },
};

const SWOT_CFG = {
  strengths:     { label: 'Strengths',     color: '#34d399' },
  weaknesses:    { label: 'Weaknesses',    color: '#f87171' },
  opportunities: { label: 'Opportunities', color: '#60a5fa' },
  threats:       { label: 'Threats',       color: '#fbbf24' },
} as const;

/* ─── Small helpers ─── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: C.txt3,
      fontFamily: "'JetBrains Mono', monospace",
      marginBottom: 8,
    }}>{children}</p>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, color: C.txt2, lineHeight: 1.75, margin: 0 }}>{children}</p>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: '32px 0' }} />;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 16, fontWeight: 600, color: C.txt1,
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '-0.02em', marginBottom: 14,
    }}>{children}</h2>
  );
}

function BulletList({ items, color }: { items: string[]; color?: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 7 }}>
          <span style={{
            flexShrink: 0, width: 5, height: 5, borderRadius: '50%',
            background: color ?? C.txt3, marginTop: '0.5em',
          }} />
          <span style={{ fontSize: 13, color: C.txt2, lineHeight: 1.65 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 9 }}>
          <span style={{
            flexShrink: 0, width: 20, height: 20, borderRadius: 5,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: C.txt2,
            fontFamily: "'JetBrains Mono', monospace",
            marginTop: 2,
          }}>{i + 1}</span>
          <span style={{ fontSize: 13, color: C.txt2, lineHeight: 1.65 }}>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Pills({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((t) => (
        <span key={t} style={{
          padding: '3px 9px', borderRadius: 5,
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          color: C.txt2,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${C.border}`,
        }}>{t}</span>
      ))}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {children}
    </div>
  );
}

/* ─── Download button with state ─── */

function DownloadButton({ projectId, teamId, projectName }: {
  projectId: string;
  teamId: string;
  projectName: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleDownload = async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/projects/${projectId}/pdf?teamId=${teamId}`);
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_strategy_brief.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  const label = state === 'loading' ? 'Generating…'
    : state === 'done'    ? 'Downloaded!'
    : state === 'error'   ? 'Error — retry'
    : 'Download PDF';

  return (
    <button
      onClick={handleDownload}
      disabled={state === 'loading'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 18px', borderRadius: 8,
        background: state === 'done' ? C.success
          : state === 'error' ? C.danger
          : C.txt1,
        color: '#000',
        border: 'none', fontSize: 12, fontWeight: 600,
        cursor: state === 'loading' ? 'wait' : 'pointer',
        fontFamily: 'Inter, sans-serif',
        opacity: state === 'loading' ? 0.7 : 1,
        transition: 'all 0.15s',
      }}
    >
      {state === 'loading' ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      ) : (
        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      )}
      {label}
    </button>
  );
}

/* ─── Page ─── */

export default function ExportPage() {
  const params = useParams();
  const { currentTeam } = useTeam();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam) return;
    fetch(`/api/projects/${params.id}?teamId=${currentTeam.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((p) => { setProject(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id, currentTeam]);

  const statusStyle: React.CSSProperties = {
    minHeight: '100vh', background: C.bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
  };

  if (loading) return (
    <div style={statusStyle}>
      <p style={{ color: C.txt3, fontSize: 14 }}>Loading…</p>
    </div>
  );

  if (!project?.analysis) return (
    <div style={statusStyle}>
      <p style={{ color: C.txt3, fontSize: 14 }}>No analysis found for this project.</p>
    </div>
  );

  const a = project.analysis;
  const date = new Date(a.analyzedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const stage = a.currentStage ? STAGE_META[a.currentStage] : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: ${C.bg}; font-family: 'Inter', sans-serif; color: ${C.txt1}; -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(9,9,11,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '10px 32px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {currentTeam && (
          <DownloadButton
            projectId={String(params.id)}
            teamId={currentTeam.id}
            projectName={a.name}
          />
        )}
        <button onClick={() => history.back()} style={{
          padding: '8px 16px', borderRadius: 8,
          background: 'transparent', color: C.txt2,
          border: `1px solid ${C.border}`,
          fontSize: 12, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>← Back</button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.txt3, fontFamily: "'JetBrains Mono', monospace" }}>
          {a.name}
        </span>
      </div>

      {/* ── Document preview ── */}
      <div style={{
        maxWidth: 840, margin: '0 auto',
        padding: '52px 48px 80px',
        minHeight: '100vh',
      }}>

        {/* Header */}
        <header style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: C.brand,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#000',
              fontFamily: "'JetBrains Mono', monospace",
            }}>R</div>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.txt3,
              fontFamily: "'JetBrains Mono', monospace",
            }}>Recgon</span>
            <span style={{
              marginLeft: 'auto', fontSize: 11, color: C.txt3,
              fontFamily: "'JetBrains Mono', monospace",
            }}>Product Strategy Brief</span>
          </div>

          <h1 style={{
            fontSize: 36, fontWeight: 700, lineHeight: 1.15,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '-0.03em', color: C.txt1, marginBottom: 14,
          }}>{a.name}</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: C.txt3 }}>Analyzed {date}</span>
            {stage && a.currentStage && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: '3px 10px', borderRadius: 20,
                background: `${stage.color}14`,
                border: `1px solid ${stage.color}30`,
                color: stage.color,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{a.currentStage}</span>
            )}
          </div>
        </header>

        {/* Overview */}
        <section>
          <Label>Product Overview</Label>
          <Body>{a.description}</Body>
          <div style={{ height: 18 }} />
          <Grid2>
            <div>
              <Label>Target Audience</Label>
              <Body>{a.targetAudience}</Body>
            </div>
            {a.problemStatement && (
              <div>
                <Label>Problem Statement</Label>
                <Body>{a.problemStatement}</Body>
              </div>
            )}
          </Grid2>
          {a.techStack.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <Label>Tech Stack</Label>
              <Pills items={a.techStack} />
            </div>
          )}
        </section>

        <Divider />

        {/* Features & USPs */}
        <section>
          <SectionHeading>Features & Differentiators</SectionHeading>
          <Grid2>
            <div>
              <Label>Key Features</Label>
              <BulletList items={a.features} />
            </div>
            <div>
              <Label>Unique Selling Points</Label>
              <BulletList items={a.uniqueSellingPoints} color={C.brand} />
            </div>
          </Grid2>
        </section>

        {a.marketOpportunity && (
          <>
            <Divider />
            <section>
              <SectionHeading>Market Opportunity</SectionHeading>
              <Body>{a.marketOpportunity}</Body>
            </section>
          </>
        )}

        {(a.competitors?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Competitive Landscape</SectionHeading>
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Competitor', 'Our Differentiator'].map((h) => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '10px 16px',
                          fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                          color: C.txt3, fontWeight: 600,
                          fontFamily: "'JetBrains Mono', monospace",
                          borderBottom: `1px solid ${C.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.competitors!.map((c, i) => (
                      <tr key={i} style={{ borderBottom: i < a.competitors!.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <td style={{ padding: '11px 16px', fontWeight: 600, color: C.txt1, fontSize: 13, width: '32%' }}>{c.name}</td>
                        <td style={{ padding: '11px 16px', color: C.txt2, fontSize: 13, lineHeight: 1.6 }}>{c.differentiator}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {(a.competitorInsights?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Competitor Intelligence</SectionHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {a.competitorInsights!.map((ci, i) => (
                  <div key={i} style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: '14px 18px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.txt1 }}>{ci.name}</span>
                      {ci.messagingTone && (
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 20,
                          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                          color: C.txt3, fontFamily: "'JetBrains Mono', monospace",
                        }}>{ci.messagingTone}</span>
                      )}
                    </div>
                    <Body>{ci.summary}</Body>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
                      <div>
                        <Label>Positioning</Label>
                        <Body>{ci.positioning}</Body>
                      </div>
                      {ci.keyFeatures.length > 0 && (
                        <div>
                          <Label>Key Features</Label>
                          <BulletList items={ci.keyFeatures} />
                        </div>
                      )}
                      {ci.weaknesses.length > 0 && (
                        <div>
                          <Label>Weaknesses</Label>
                          <BulletList items={ci.weaknesses} color={C.danger} />
                        </div>
                      )}
                    </div>
                    {ci.differentiator && (
                      <div style={{
                        marginTop: 12, padding: '9px 13px', borderRadius: 7,
                        background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.borderStrong}`,
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: C.txt1, letterSpacing: '0.05em', flexShrink: 0, paddingTop: 2 }}>OUR EDGE</span>
                        <Body>{ci.differentiator}</Body>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {(a.businessModel || (a.revenueStreams?.length ?? 0) > 0 || a.pricingSuggestion) && (
          <>
            <Divider />
            <section>
              <SectionHeading>Business Model</SectionHeading>
              {a.businessModel && <div style={{ marginBottom: 16 }}><Body>{a.businessModel}</Body></div>}
              <Grid2>
                {(a.revenueStreams?.length ?? 0) > 0 && (
                  <div>
                    <Label>Revenue Streams</Label>
                    <BulletList items={a.revenueStreams!} color={C.success} />
                  </div>
                )}
                {a.pricingSuggestion && (
                  <div>
                    <Label>Pricing Suggestion</Label>
                    <Body>{a.pricingSuggestion}</Body>
                  </div>
                )}
              </Grid2>
            </section>
          </>
        )}

        {a.swot && (
          <>
            <Divider />
            <section>
              <SectionHeading>SWOT Analysis</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(Object.keys(SWOT_CFG) as (keyof typeof SWOT_CFG)[]).map((key) => {
                  const cfg = SWOT_CFG[key];
                  return (
                    <div key={key} style={{
                      padding: '14px 16px', borderRadius: 10,
                      background: `${cfg.color}08`,
                      border: `1px solid ${cfg.color}20`,
                      borderTop: `2px solid ${cfg.color}`,
                    }}>
                      <p style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: cfg.color, fontFamily: "'JetBrains Mono', monospace",
                        marginBottom: 10,
                      }}>{cfg.label}</p>
                      <BulletList items={a.swot![key] ?? []} color={cfg.color} />
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {((a.prioritizedNextSteps?.length ?? 0) > 0 || (a.topRisks?.length ?? 0) > 0) && (
          <>
            <Divider />
            <section>
              <SectionHeading>Action Plan</SectionHeading>
              <Grid2>
                {(a.prioritizedNextSteps?.length ?? 0) > 0 && (
                  <div>
                    <Label>Prioritized Next Steps</Label>
                    <NumberedList items={a.prioritizedNextSteps!} />
                  </div>
                )}
                {(a.topRisks?.length ?? 0) > 0 && (
                  <div>
                    <Label>Top Risks</Label>
                    <BulletList items={a.topRisks!} color={C.danger} />
                  </div>
                )}
              </Grid2>
            </section>
          </>
        )}

        {(a.gtmStrategy || (a.earlyAdopterChannels?.length ?? 0) > 0 || (a.growthMetrics?.length ?? 0) > 0) && (
          <>
            <Divider />
            <section>
              <SectionHeading>Go-to-Market Strategy</SectionHeading>
              {a.gtmStrategy && <div style={{ marginBottom: 16 }}><Body>{a.gtmStrategy}</Body></div>}
              <Grid2>
                {(a.earlyAdopterChannels?.length ?? 0) > 0 && (
                  <div>
                    <Label>Early Adopter Channels</Label>
                    <BulletList items={a.earlyAdopterChannels!} color={C.blue} />
                  </div>
                )}
                {(a.growthMetrics?.length ?? 0) > 0 && (
                  <div>
                    <Label>Growth Metrics</Label>
                    <BulletList items={a.growthMetrics!} color={C.success} />
                  </div>
                )}
              </Grid2>
            </section>
          </>
        )}

        {(a.improvements?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Recommended Improvements</SectionHeading>
              <BulletList items={a.improvements!} color={C.warning} />
            </section>
          </>
        )}

        {(a.nextStepsTaken?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Execution Progress</SectionHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {a.nextStepsTaken!.map((ns, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '11px 14px', borderRadius: 9,
                    background: ns.taken ? `${C.success}08` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${ns.taken ? `${C.success}25` : C.border}`,
                  }}>
                    <div style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: 5,
                      background: ns.taken ? `${C.success}20` : 'transparent',
                      border: `1.5px solid ${ns.taken ? C.success : C.txt3}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: C.success, marginTop: 1,
                    }}>{ns.taken ? '✓' : ''}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, lineHeight: 1.6, color: ns.taken ? C.txt1 : C.txt2, marginBottom: ns.evidence ? 3 : 0 }}>
                        {ns.step}
                      </p>
                      {ns.evidence && (
                        <p style={{ fontSize: 12, color: C.txt3, lineHeight: 1.5 }}>{ns.evidence}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 60, paddingTop: 18,
          borderTop: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 16, height: 16, borderRadius: 4,
              background: C.brand,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: '#000',
              fontFamily: "'JetBrains Mono', monospace",
            }}>R</div>
            <span style={{ fontSize: 11, color: C.txt3 }}>Generated by Recgon</span>
          </div>
          <span style={{ fontSize: 11, color: C.txt3, fontFamily: "'JetBrains Mono', monospace" }}>recgon.ai</span>
        </div>
      </div>
    </>
  );
}

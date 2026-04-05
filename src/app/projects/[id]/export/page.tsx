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

interface Project {
  id: string;
  name: string;
  analysis?: ProductAnalysis;
}

/* ─── Design tokens ─── */
const C = {
  bg: '#080809',
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  txt1: '#f4f4f5',
  txt2: '#a1a1aa',
  txt3: '#71717a',
  brand: '#e8a8c4',        // signature – used sparingly
  success: '#34d399',
  danger: '#f87171',
  warning: '#fbbf24',
  blue: '#60a5fa',
} as const;

const STAGE_META: Record<string, { label: string; color: string }> = {
  idea:   { label: 'Idea',   color: C.warning },
  mvp:    { label: 'MVP',    color: C.brand   },
  beta:   { label: 'Beta',   color: C.blue    },
  growth: { label: 'Growth', color: C.success },
  mature: { label: 'Mature', color: C.txt2    },
};

const SWOT_CFG = {
  strengths:    { label: 'Strengths',     color: C.success },
  weaknesses:   { label: 'Weaknesses',    color: C.danger  },
  opportunities:{ label: 'Opportunities', color: C.blue    },
  threats:      { label: 'Threats',       color: C.warning },
} as const;

/* ─── Primitive components ─── */

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: '36px 0' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: C.txt3,
      fontFamily: "'JetBrains Mono', monospace",
      marginBottom: 12,
    }}>{children}</p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 18, fontWeight: 600, color: C.txt1,
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '-0.02em',
      marginBottom: 16,
    }}>{children}</h2>
  );
}

function Body({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <p style={{
      fontSize: 13, lineHeight: 1.75,
      color: dim ? C.txt2 : 'rgba(244,244,245,0.82)',
      margin: 0,
    }}>{children}</p>
  );
}

function Callout({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      borderLeft: `2px solid ${color ?? C.borderStrong}`,
      paddingLeft: 14,
      marginTop: 10,
    }}>
      <Body>{children}</Body>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '14px 18px',
      ...style,
    }}>{children}</div>
  );
}

function Pills({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((t) => (
        <span key={t} style={{
          padding: '3px 10px', borderRadius: 6,
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          color: C.txt2,
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${C.border}`,
        }}>{t}</span>
      ))}
    </div>
  );
}

function List({ items, color }: { items: string[]; color?: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          marginBottom: 7, lineHeight: 1.65,
        }}>
          <span style={{
            flexShrink: 0, marginTop: '0.35em',
            width: 5, height: 5, borderRadius: '50%',
            background: color ?? C.txt3,
          }} />
          <span style={{ fontSize: 13, color: 'rgba(244,244,245,0.8)' }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          marginBottom: 10,
        }}>
          <span style={{
            flexShrink: 0,
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            color: C.txt2,
            marginTop: 1,
          }}>{i + 1}</span>
          <span style={{ fontSize: 13, color: 'rgba(244,244,245,0.82)', lineHeight: 1.65 }}>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {children}
    </div>
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

  useEffect(() => {
    if (project?.analysis && !loading) {
      setTimeout(() => window.print(), 600);
    }
  }, [project, loading]);

  const statusStyle: React.CSSProperties = {
    minHeight: '100vh', background: C.bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
  };

  if (loading) return (
    <div style={statusStyle}>
      <p style={{ color: C.txt3, fontSize: 14 }}>Preparing report…</p>
    </div>
  );

  if (!project?.analysis) return (
    <div style={statusStyle}>
      <p style={{ color: C.txt3, fontSize: 14 }}>No analysis found for this project.</p>
    </div>
  );

  const a = project.analysis;
  const date = new Date(a.analyzedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const stage = a.currentStage ? STAGE_META[a.currentStage] : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          background: ${C.bg} !important;
          color: ${C.txt1};
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        @media print {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;

          html, body { background: ${C.bg} !important; }
          .no-print { display: none !important; }

          @page {
            size: A4;
            margin: 18mm 20mm;
          }
        }
      `}</style>

      {/* ── Screen toolbar ── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(8,8,9,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '10px 32px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => window.print()} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderRadius: 8,
          background: C.txt1, color: C.bg,
          border: 'none', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.01em',
        }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Export PDF
        </button>
        <button onClick={() => history.back()} style={{
          padding: '7px 16px', borderRadius: 8,
          background: 'transparent', color: C.txt2,
          border: `1px solid ${C.border}`,
          fontSize: 12, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>← Back</button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.txt3, fontFamily: "'JetBrains Mono', monospace" }}>
          {a.name}
        </span>
      </div>

      {/* ── Document ── */}
      <div style={{
        maxWidth: 840, margin: '0 auto',
        padding: '56px 48px 80px',
        background: C.bg,
        minHeight: '100vh',
      }}>

        {/* ── Cover header ── */}
        <header style={{ marginBottom: 52 }}>
          {/* Brand line */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 40,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect width="22" height="22" rx="6" fill={C.brand} />
              <text x="11" y="15.5" textAnchor="middle" fontSize="11" fontWeight="700"
                fontFamily="'JetBrains Mono', monospace" fill="#000">R</text>
            </svg>
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

          {/* Title */}
          <h1 style={{
            fontSize: 40, fontWeight: 700, lineHeight: 1.15,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '-0.03em',
            color: C.txt1,
            marginBottom: 18,
          }}>{a.name}</h1>

          {/* Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.txt3 }}>Analyzed {date}</span>
            {stage && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: '3px 10px', borderRadius: 20,
                background: `${stage.color}14`,
                border: `1px solid ${stage.color}30`,
                color: stage.color,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{stage.label}</span>
            )}
          </div>
        </header>

        {/* ── Product Overview ── */}
        <section style={{ marginBottom: 0 }}>
          <SectionLabel>Product Overview</SectionLabel>
          <Body>{a.description}</Body>

          <div style={{ height: 20 }} />

          <Grid2>
            <div>
              <SectionLabel>Target Audience</SectionLabel>
              <Body>{a.targetAudience}</Body>
            </div>
            {a.problemStatement && (
              <div>
                <SectionLabel>Problem Statement</SectionLabel>
                <Body>{a.problemStatement}</Body>
              </div>
            )}
          </Grid2>

          {a.techStack.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <SectionLabel>Tech Stack</SectionLabel>
              <Pills items={a.techStack} />
            </div>
          )}
        </section>

        <Divider />

        {/* ── Features & USPs ── */}
        <section>
          <SectionHeading>Features & Differentiators</SectionHeading>
          <Grid2>
            <div>
              <SectionLabel>Key Features</SectionLabel>
              <List items={a.features} />
            </div>
            <div>
              <SectionLabel>Unique Selling Points</SectionLabel>
              <List items={a.uniqueSellingPoints} color={C.brand} />
            </div>
          </Grid2>
        </section>

        {/* ── Market Opportunity ── */}
        {a.marketOpportunity && (
          <>
            <Divider />
            <section>
              <SectionHeading>Market Opportunity</SectionHeading>
              <Body>{a.marketOpportunity}</Body>
            </section>
          </>
        )}

        {/* ── Competitive Landscape ── */}
        {(a.competitors?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Competitive Landscape</SectionHeading>
              <div style={{
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                overflow: 'hidden',
              }}>
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
                      <tr key={i} style={{
                        borderBottom: i < a.competitors!.length - 1
                          ? `1px solid ${C.border}` : 'none',
                      }}>
                        <td style={{
                          padding: '11px 16px', fontWeight: 600,
                          color: C.txt1, fontSize: 13, whiteSpace: 'nowrap',
                        }}>{c.name}</td>
                        <td style={{
                          padding: '11px 16px', color: C.txt2,
                          fontSize: 13, lineHeight: 1.6,
                        }}>{c.differentiator}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ── Competitor Intelligence ── */}
        {(a.competitorInsights?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Competitor Intelligence</SectionHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {a.competitorInsights!.map((ci, i) => (
                  <Card key={i}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.txt1 }}>{ci.name}</span>
                      {ci.messagingTone && (
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 20,
                          background: 'rgba(255,255,255,0.05)',
                          border: `1px solid ${C.border}`,
                          color: C.txt3,
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '0.04em',
                        }}>{ci.messagingTone}</span>
                      )}
                    </div>

                    <Body dim>{ci.summary}</Body>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
                      <div>
                        <SectionLabel>Positioning</SectionLabel>
                        <Body>{ci.positioning}</Body>
                      </div>
                      {ci.keyFeatures.length > 0 && (
                        <div>
                          <SectionLabel>Key Features</SectionLabel>
                          <List items={ci.keyFeatures} />
                        </div>
                      )}
                      {ci.weaknesses.length > 0 && (
                        <div>
                          <SectionLabel>Weaknesses</SectionLabel>
                          <List items={ci.weaknesses} color={C.danger} />
                        </div>
                      )}
                    </div>

                    {ci.differentiator && (
                      <div style={{
                        marginTop: 14,
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${C.borderStrong}`,
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, color: C.txt1,
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '0.04em',
                          flexShrink: 0, paddingTop: 2,
                        }}>OUR EDGE</span>
                        <Body>{ci.differentiator}</Body>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── Business Model ── */}
        {(a.businessModel || (a.revenueStreams?.length ?? 0) > 0 || a.pricingSuggestion) && (
          <>
            <Divider />
            <section>
              <SectionHeading>Business Model</SectionHeading>
              {a.businessModel && <Body>{a.businessModel}</Body>}
              {((a.revenueStreams?.length ?? 0) > 0 || a.pricingSuggestion) && (
                <Grid2>
                  {(a.revenueStreams?.length ?? 0) > 0 && (
                    <div style={{ marginTop: a.businessModel ? 16 : 0 }}>
                      <SectionLabel>Revenue Streams</SectionLabel>
                      <List items={a.revenueStreams!} color={C.success} />
                    </div>
                  )}
                  {a.pricingSuggestion && (
                    <div style={{ marginTop: a.businessModel ? 16 : 0 }}>
                      <SectionLabel>Pricing Suggestion</SectionLabel>
                      <Body>{a.pricingSuggestion}</Body>
                    </div>
                  )}
                </Grid2>
              )}
            </section>
          </>
        )}

        {/* ── SWOT ── */}
        {a.swot && (
          <>
            <Divider />
            <section>
              <SectionHeading>SWOT Analysis</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(Object.keys(SWOT_CFG) as (keyof typeof SWOT_CFG)[]).map((key) => {
                  const cfg = SWOT_CFG[key];
                  const items = a.swot![key] ?? [];
                  return (
                    <div key={key} style={{
                      padding: '16px 18px',
                      borderRadius: 10,
                      background: `${cfg.color}08`,
                      border: `1px solid ${cfg.color}20`,
                      borderTop: `2px solid ${cfg.color}`,
                    }}>
                      <p style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: cfg.color,
                        fontFamily: "'JetBrains Mono', monospace",
                        marginBottom: 12,
                      }}>{cfg.label}</p>
                      <List items={items} color={cfg.color} />
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ── Action Plan ── */}
        {((a.prioritizedNextSteps?.length ?? 0) > 0 || (a.topRisks?.length ?? 0) > 0) && (
          <>
            <Divider />
            <section>
              <SectionHeading>Action Plan</SectionHeading>
              <Grid2>
                {(a.prioritizedNextSteps?.length ?? 0) > 0 && (
                  <div>
                    <SectionLabel>Prioritized Next Steps</SectionLabel>
                    <NumberedList items={a.prioritizedNextSteps!} />
                  </div>
                )}
                {(a.topRisks?.length ?? 0) > 0 && (
                  <div>
                    <SectionLabel>Top Risks</SectionLabel>
                    <List items={a.topRisks!} color={C.danger} />
                  </div>
                )}
              </Grid2>
            </section>
          </>
        )}

        {/* ── GTM ── */}
        {(a.gtmStrategy || (a.earlyAdopterChannels?.length ?? 0) > 0 || (a.growthMetrics?.length ?? 0) > 0) && (
          <>
            <Divider />
            <section>
              <SectionHeading>Go-to-Market Strategy</SectionHeading>
              {a.gtmStrategy && (
                <div style={{ marginBottom: 20 }}>
                  <Body>{a.gtmStrategy}</Body>
                </div>
              )}
              <Grid2>
                {(a.earlyAdopterChannels?.length ?? 0) > 0 && (
                  <div>
                    <SectionLabel>Early Adopter Channels</SectionLabel>
                    <List items={a.earlyAdopterChannels!} color={C.blue} />
                  </div>
                )}
                {(a.growthMetrics?.length ?? 0) > 0 && (
                  <div>
                    <SectionLabel>Growth Metrics</SectionLabel>
                    <List items={a.growthMetrics!} color={C.success} />
                  </div>
                )}
              </Grid2>
            </section>
          </>
        )}

        {/* ── Improvements ── */}
        {(a.improvements?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Recommended Improvements</SectionHeading>
              <List items={a.improvements!} color={C.warning} />
            </section>
          </>
        )}

        {/* ── Next Steps Progress ── */}
        {(a.nextStepsTaken?.length ?? 0) > 0 && (
          <>
            <Divider />
            <section>
              <SectionHeading>Execution Progress</SectionHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {a.nextStepsTaken!.map((ns, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 14, alignItems: 'flex-start',
                    padding: '12px 16px', borderRadius: 10,
                    background: ns.taken ? `${C.success}08` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${ns.taken ? `${C.success}25` : C.border}`,
                  }}>
                    <div style={{
                      flexShrink: 0,
                      width: 20, height: 20, borderRadius: 6,
                      background: ns.taken ? `${C.success}20` : 'transparent',
                      border: `1.5px solid ${ns.taken ? C.success : C.txt3}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: ns.taken ? C.success : C.txt3,
                      marginTop: 1,
                    }}>{ns.taken ? '✓' : ''}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{
                        fontSize: 13, lineHeight: 1.6, marginBottom: ns.evidence ? 4 : 0,
                        color: ns.taken ? 'rgba(244,244,245,0.9)' : C.txt2,
                      }}>{ns.step}</p>
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

        {/* ── Footer ── */}
        <div style={{
          marginTop: 64,
          paddingTop: 20,
          borderTop: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect width="16" height="16" rx="4" fill={C.brand} />
              <text x="8" y="11.5" textAnchor="middle" fontSize="8" fontWeight="700"
                fontFamily="'JetBrains Mono', monospace" fill="#000">R</text>
            </svg>
            <span style={{ fontSize: 11, color: C.txt3 }}>Generated by Recgon</span>
          </div>
          <span style={{ fontSize: 11, color: C.txt3, fontFamily: "'JetBrains Mono', monospace" }}>
            recgon.ai
          </span>
        </div>
      </div>
    </>
  );
}

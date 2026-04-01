'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';

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
  competitors?: { name: string; differentiator: string }[];
  businessModel?: string;
  revenueStreams?: string[];
  pricingSuggestion?: string;
  currentStage?: string;
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  topRisks?: string[];
  prioritizedNextSteps?: string[];
  gtmStrategy?: string;
  earlyAdopterChannels?: string[];
  growthMetrics?: string[];
}

interface Project {
  id: string;
  name: string;
  analysis?: ProductAnalysis;
}

const S = {
  page: { maxWidth: 800, margin: '0 auto', padding: '40px 32px', fontFamily: 'Inter, -apple-system, sans-serif', color: '#1d1d1f', lineHeight: 1.7 } as const,
  h1: { fontSize: 28, fontWeight: 700, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" } as const,
  h2: { fontSize: 18, fontWeight: 700, marginTop: 32, marginBottom: 12, borderBottom: '1px solid #e5e5e7', paddingBottom: 8, color: '#1d1d1f' } as const,
  h3: { fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#86868b', textTransform: 'uppercase' as const, letterSpacing: '0.5px' } as const,
  p: { fontSize: 14, marginBottom: 12, color: '#424245' } as const,
  list: { listStyle: 'none', padding: 0, margin: 0 } as const,
  li: { fontSize: 14, color: '#424245', marginBottom: 6, paddingLeft: 16, position: 'relative' as const } as const,
  bullet: { position: 'absolute' as const, left: 0, color: '#e8a8c4', fontWeight: 700 } as const,
  tag: { display: 'inline-block', padding: '2px 8px', margin: '2px 4px 2px 0', fontSize: 12, background: '#f5f5f7', borderRadius: 4, color: '#424245' } as const,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } as const,
  swotBox: { padding: 12, border: '1px solid #e5e5e7', borderRadius: 8, fontSize: 13 } as const,
  meta: { fontSize: 12, color: '#86868b', marginBottom: 32 } as const,
  noPrint: { marginBottom: 24 } as const,
};

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
      // Auto-trigger print dialog after render
      setTimeout(() => window.print(), 500);
    }
  }, [project, loading]);

  if (loading) return <div style={S.page}><p>Loading...</p></div>;
  if (!project?.analysis) return <div style={S.page}><p>No analysis found for this project.</p></div>;

  const a = project.analysis;
  const date = new Date(a.analyzedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .mesh-bg, .sidebar, .app-layout > nav { display: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="no-print" style={S.noPrint}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '16px 0' }}>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Save as PDF
          </button>
          <button className="btn btn-secondary" onClick={() => history.back()}>
            Back to Project
          </button>
        </div>
      </div>

      <div style={S.page}>
        <h1 style={S.h1}>{a.name}</h1>
        <p style={S.meta}>
          Product Strategy Brief — analyzed {date}
          {a.currentStage && <> — Stage: <strong>{a.currentStage.toUpperCase()}</strong></>}
        </p>

        {/* Overview */}
        <h2 style={S.h2}>Product Overview</h2>
        <p style={S.p}>{a.description}</p>

        <div style={S.grid2}>
          <div>
            <h3 style={S.h3}>Target Audience</h3>
            <p style={S.p}>{a.targetAudience}</p>
          </div>
          {a.problemStatement && (
            <div>
              <h3 style={S.h3}>Problem Statement</h3>
              <p style={S.p}>{a.problemStatement}</p>
            </div>
          )}
        </div>

        <h3 style={S.h3}>Tech Stack</h3>
        <div style={{ marginBottom: 16 }}>
          {a.techStack.map((t) => <span key={t} style={S.tag}>{t}</span>)}
        </div>

        {/* Features & USPs */}
        <h2 style={S.h2}>Features & Differentiators</h2>
        <div style={S.grid2}>
          <div>
            <h3 style={S.h3}>Key Features</h3>
            <ul style={S.list}>
              {a.features.map((f, i) => <li key={i} style={S.li}><span style={S.bullet}>›</span>{f}</li>)}
            </ul>
          </div>
          <div>
            <h3 style={S.h3}>Unique Selling Points</h3>
            <ul style={S.list}>
              {a.uniqueSellingPoints.map((u, i) => <li key={i} style={S.li}><span style={S.bullet}>›</span>{u}</li>)}
            </ul>
          </div>
        </div>

        {/* Market */}
        {a.marketOpportunity && (
          <>
            <h2 style={S.h2}>Market Opportunity</h2>
            <p style={S.p}>{a.marketOpportunity}</p>
          </>
        )}

        {(a.competitors?.length ?? 0) > 0 && (
          <>
            <h3 style={S.h3}>Competitive Landscape</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e5e7' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#86868b', fontWeight: 600 }}>Competitor</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#86868b', fontWeight: 600 }}>Differentiator</th>
                </tr>
              </thead>
              <tbody>
                {a.competitors?.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f2' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '6px 8px', color: '#424245' }}>{c.differentiator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Business Model */}
        {(a.businessModel || a.revenueStreams?.length || a.pricingSuggestion) && (
          <>
            <h2 style={S.h2}>Business Model</h2>
            {a.businessModel && <p style={S.p}>{a.businessModel}</p>}
            <div style={S.grid2}>
              {(a.revenueStreams?.length ?? 0) > 0 && (
                <div>
                  <h3 style={S.h3}>Revenue Streams</h3>
                  <ul style={S.list}>
                    {a.revenueStreams?.map((r, i) => <li key={i} style={S.li}><span style={S.bullet}>›</span>{r}</li>)}
                  </ul>
                </div>
              )}
              {a.pricingSuggestion && (
                <div>
                  <h3 style={S.h3}>Pricing Suggestion</h3>
                  <p style={S.p}>{a.pricingSuggestion}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* SWOT */}
        {a.swot && (
          <>
            <h2 style={S.h2}>SWOT Analysis</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(['strengths', 'weaknesses', 'opportunities', 'threats'] as const).map((key) => (
                <div key={key} style={{ ...S.swotBox, borderLeftColor: key === 'strengths' ? '#34C759' : key === 'weaknesses' ? '#FF3B30' : key === 'opportunities' ? '#e8a8c4' : '#FF9F0A', borderLeftWidth: 3 }}>
                  <h3 style={{ ...S.h3, color: key === 'strengths' ? '#34C759' : key === 'weaknesses' ? '#FF3B30' : key === 'opportunities' ? '#e8a8c4' : '#FF9F0A' }}>
                    {key}
                  </h3>
                  <ul style={S.list}>
                    {(a.swot?.[key] ?? []).map((item, i) => <li key={i} style={{ ...S.li, fontSize: 13 }}><span style={S.bullet}>›</span>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Action Plan */}
        {((a.prioritizedNextSteps?.length ?? 0) > 0 || (a.topRisks?.length ?? 0) > 0) && (
          <>
            <h2 style={S.h2}>Action Plan</h2>
            <div style={S.grid2}>
              {(a.prioritizedNextSteps?.length ?? 0) > 0 && (
                <div>
                  <h3 style={S.h3}>Prioritized Next Steps</h3>
                  <ol style={{ ...S.list, listStyle: 'none' }}>
                    {a.prioritizedNextSteps?.map((s, i) => (
                      <li key={i} style={S.li}>
                        <span style={{ ...S.bullet, color: '#86868b', fontSize: 12 }}>{i + 1}.</span>{s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {(a.topRisks?.length ?? 0) > 0 && (
                <div>
                  <h3 style={S.h3}>Top Risks</h3>
                  <ul style={S.list}>
                    {a.topRisks?.map((r, i) => <li key={i} style={S.li}><span style={{ ...S.bullet, color: '#FF3B30' }}>›</span>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* GTM */}
        {(a.gtmStrategy || (a.earlyAdopterChannels?.length ?? 0) > 0 || (a.growthMetrics?.length ?? 0) > 0) && (
          <>
            <h2 style={S.h2}>Go-to-Market Strategy</h2>
            {a.gtmStrategy && <p style={S.p}>{a.gtmStrategy}</p>}
            <div style={S.grid2}>
              {(a.earlyAdopterChannels?.length ?? 0) > 0 && (
                <div>
                  <h3 style={S.h3}>Early Adopter Channels</h3>
                  <ul style={S.list}>
                    {a.earlyAdopterChannels?.map((c, i) => <li key={i} style={S.li}><span style={S.bullet}>›</span>{c}</li>)}
                  </ul>
                </div>
              )}
              {(a.growthMetrics?.length ?? 0) > 0 && (
                <div>
                  <h3 style={S.h3}>Growth Metrics</h3>
                  <ul style={S.list}>
                    {a.growthMetrics?.map((m, i) => <li key={i} style={S.li}><span style={S.bullet}>›</span>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e5e5e7', fontSize: 11, color: '#86868b', textAlign: 'center' }}>
          Generated by Recgon — recgon.ai
        </div>
      </div>
    </>
  );
}

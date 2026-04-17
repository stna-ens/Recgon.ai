'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';

interface Project {
  id: string;
  name: string;
  createdAt: string;
  analyticsPropertyId?: string;
  analysis?: {
    overallScore?: number;
    analyzedAt?: string;
    [key: string]: unknown;
  };
}

interface OverviewBrief {
  brief: string;
  focusArea: string;
}

interface Action {
  id: string;
  title: string;
  source: 'analysis' | 'feedback';
  projectName: string;
  priority: 'high' | 'med' | 'low';
  surfacedAt: string | null;
}

interface Signal {
  id: string;
  label: string;
  projectName: string | null;
  createdAt: string;
}

interface AnalyticsDelta {
  projectName: string;
  sessionsCurrent: number;
  sessionsPrevious: number;
  deltaPct: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PRIORITY_COLOR = { high: 'var(--danger)', med: 'var(--warning)', low: 'var(--success)' };
const PRIORITY_SHADOW = { high: '0 0 5px var(--danger)', med: 'none', low: 'none' };

export default function OverviewPage() {
  const router = useRouter();
  const { currentTeam } = useTeam();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const [brief, setBrief] = useState<OverviewBrief | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [unreadFeedback, setUnreadFeedback] = useState(0);
  const [analytics, setAnalytics] = useState<AnalyticsDelta[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [ask, setAsk] = useState('');

  const teamId = currentTeam?.id ?? null;

  useEffect(() => {
    if (!teamId) return;

    setProjectsLoading(true);
    setOverviewLoading(true);

    fetch(`/api/projects?teamId=${teamId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setProjects(data); setProjectsLoading(false); })
      .catch(() => setProjectsLoading(false));

    fetch(`/api/overview?teamId=${teamId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          if (data.brief) setBrief(data.brief);
          setActions(data.actions ?? []);
          setSignals(data.signals ?? []);
          setUnreadFeedback(data.unreadFeedback ?? 0);
          setAnalytics(data.analytics ?? []);
        }
        setOverviewLoading(false);
      })
      .catch(() => setOverviewLoading(false));
  }, [teamId]);

  const analyzed = projects.filter((p) => p.analysis).length;
  const analyzedProjects = projects.filter((p) => p.analysis);
  const scoredProjects = analyzedProjects.filter((p) => p.analysis?.overallScore !== undefined);
  const avgHealth = scoredProjects.length > 0
    ? Math.round(scoredProjects.reduce((sum, p) => sum + p.analysis!.overallScore!, 0) / scoredProjects.length * 10) / 10
    : null;
  const needsAttention = scoredProjects.filter((p) => p.analysis!.overallScore! < 6).length;

  const analyticsConnected = projects.filter((p) => p.analyticsPropertyId).length;
  const showAnalyticsNudge = !projectsLoading && analyzed > 0 && analyticsConnected === 0;

  function submitAsk(e: FormEvent) {
    e.preventDefault();
    const q = ask.trim();
    if (!q) { router.push('/mentor'); return; }
    try { sessionStorage.setItem('mentor:prefill', q); } catch {}
    router.push('/mentor');
  }

  const showEmpty = !projectsLoading && projects.length === 0;

  if (showEmpty) {
    return (
      <div>
        <div className="page-header" style={{ marginBottom: 40 }}>
          <h2>Overview</h2>
          <p>{currentTeam?.name ? <strong>{currentTeam.name}</strong> : 'Loading…'}</p>
        </div>
        <div className="glass-card" style={{ textAlign: 'center', padding: '64px 32px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(var(--signature-rgb), 0.08)',
            border: '1px solid rgba(var(--signature-rgb), 0.2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--signature)', marginBottom: 20,
          }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--txt-pure)' }}>
            Welcome to Recgon
          </h3>
          <p style={{ fontSize: 14, color: 'var(--txt-muted)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Add your first project to get a health analysis, actionable priorities, and
            a pulse from the mentor.
          </p>
          <div style={{ display: 'inline-flex', gap: 10 }}>
            <Link href="/projects/new" className="btn btn-primary btn-sm">
              Add your first project
            </Link>
            <Link href="/mentor" className="btn btn-secondary btn-sm">
              Ask the mentor
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h2>Overview</h2>
          <p>
            {currentTeam?.name
              ? <><strong>{currentTeam.name}</strong> · {projects.length} project{projects.length !== 1 ? 's' : ''}</>
              : 'Loading…'}
          </p>
        </div>
      </div>

      {/* Recgon pulse */}
      <div className="glass-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="recgon-label" style={{ margin: 0 }}>recgon's pulse</span>
          {(avgHealth !== null || unreadFeedback > 0) && (
            <span style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11, color: 'var(--txt-faint)', letterSpacing: '0.2px',
            }}>
              {avgHealth !== null && (
                <>
                  avg health <strong style={{ color: 'var(--txt-pure)' }}>{avgHealth}</strong>
                  {' · '}{analyzed} analyzed
                  {needsAttention > 0 && <> · <span style={{ color: 'var(--warning)' }}>{needsAttention} slipping</span></>}
                </>
              )}
              {unreadFeedback > 0 && (
                <>
                  {avgHealth !== null && ' · '}
                  <Link href="/feedback" style={{ color: 'var(--signature)', textDecoration: 'none', fontWeight: 600 }}>
                    {unreadFeedback} new feedback
                  </Link>
                </>
              )}
            </span>
          )}
        </div>
        {overviewLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[100, 80, 60].map((w) => (
              <div key={w} style={{
                height: 14, borderRadius: 6,
                background: 'rgba(var(--signature-rgb), 0.08)',
                width: `${w}%`,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        ) : brief ? (
          <div>
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--txt-pure)', marginBottom: 12 }}>
              {brief.brief}
            </p>
            <p style={{
              fontSize: 13.5, color: 'var(--signature)', fontWeight: 500,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              paddingTop: 12, borderTop: '1px solid var(--btn-secondary-border)',
              marginBottom: 0,
            }}>
              → {brief.focusArea}
            </p>
          </div>
        ) : analyzed === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--txt-muted)' }}>
            Analyze a project to get your first pulse from the mentor.
          </p>
        ) : (
          <p style={{ fontSize: 13.5, color: 'var(--txt-muted)' }}>Generating your pulse — refresh in a moment.</p>
        )}

        {analytics.length > 0 && (
          <div style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--btn-secondary-border)',
            display: 'flex', flexWrap: 'wrap', gap: 16,
          }}>
            {analytics.map((a) => {
              const up = a.deltaPct > 0;
              const flat = a.deltaPct === 0;
              const color = flat ? 'var(--txt-faint)' : up ? 'var(--success)' : 'var(--danger)';
              const arrow = flat ? '·' : up ? '↑' : '↓';
              return (
                <div key={a.projectName} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 11.5,
                }}>
                  <span style={{
                    background: 'rgba(var(--signature-rgb), 0.08)',
                    border: '1px solid rgba(var(--signature-rgb), 0.2)',
                    color: 'var(--signature)',
                    padding: '1px 7px', borderRadius: 'var(--r-pill)',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
                  }}>
                    {a.projectName}
                  </span>
                  <span style={{ color: 'var(--txt-muted)' }}>
                    sessions <strong style={{ color: 'var(--txt-pure)', fontWeight: 600 }}>{a.sessionsCurrent}</strong>
                  </span>
                  <span style={{ color, fontWeight: 600 }}>
                    {arrow} {flat ? 'flat' : `${Math.abs(a.deltaPct)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {showAnalyticsNudge && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(var(--signature-rgb), 0.05)',
            border: '1px solid rgba(var(--signature-rgb), 0.15)',
            borderRadius: 'var(--r-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span style={{ fontSize: 12.5, color: 'var(--txt-muted)' }}>
              No analytics connected — link GA4 to see real traffic.
            </span>
            <Link href="/analytics" style={{
              fontSize: 12, fontWeight: 600, color: 'var(--signature)',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              Connect →
            </Link>
          </div>
        )}

        {/* Ask mentor input */}
        <form
          onSubmit={submitAsk}
          style={{
            marginTop: 18,
            display: 'flex', gap: 8, alignItems: 'stretch',
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Ask the mentor…"
            style={{
              flex: 1,
              padding: '10px 14px',
              background: 'var(--bg-input)',
              border: '1px solid var(--btn-secondary-border)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--txt-pure)',
              fontSize: 13.5,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid var(--btn-secondary-border)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--txt-muted)',
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            {ask.trim() ? 'Ask' : 'Open mentor'}
          </button>
        </form>
      </div>

      {/* Actions + Signals */}
      <div className="grid-2" style={{ marginBottom: 24 }}>

        {/* Priority Actions */}
        <div className="glass-card">
          <span className="recgon-label">priority actions</span>
          {overviewLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(var(--signature-rgb), 0.2)', marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 13, borderRadius: 6, background: 'rgba(var(--signature-rgb), 0.08)' }} />
                </div>
              ))}
            </div>
          ) : actions.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--txt-muted)' }}>
              {analyzed === 0 ? 'Analyze a project to see action items.' : 'No actions right now — good shape!'}
            </p>
          ) : (
            <div>
              {actions.map((action, idx) => (
                <div
                  key={action.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 11,
                    padding: '11px 0',
                    borderBottom: idx < actions.length - 1 ? '1px solid var(--btn-secondary-border)' : 'none',
                  }}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: PRIORITY_COLOR[action.priority],
                    boxShadow: PRIORITY_SHADOW[action.priority],
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3, color: 'var(--txt-pure)' }}>
                      {action.title}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 11, color: 'var(--txt-faint)',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                      <span style={{
                        background: 'rgba(var(--signature-rgb), 0.08)',
                        border: '1px solid rgba(var(--signature-rgb), 0.2)',
                        color: 'var(--signature)',
                        padding: '1px 7px', borderRadius: 'var(--r-pill)',
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
                      }}>
                        {action.projectName}
                      </span>
                      {action.source}
                      {action.surfacedAt && (() => {
                        const ageDays = Math.floor((Date.now() - new Date(action.surfacedAt).getTime()) / 86400000);
                        if (ageDays < 1) return null;
                        const stale = ageDays >= 14;
                        return (
                          <span style={{
                            color: stale ? 'var(--warning)' : 'var(--txt-faint)',
                            fontWeight: stale ? 600 : 400,
                          }}>
                            · {ageDays}d
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Signals */}
        <div className="glass-card">
          <span className="recgon-label">recent signals</span>
          {overviewLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 44, height: 11, borderRadius: 4, background: 'rgba(var(--signature-rgb), 0.08)', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 11, borderRadius: 4, background: 'rgba(var(--signature-rgb), 0.05)' }} />
                </div>
              ))}
            </div>
          ) : signals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--txt-muted)' }}>
              Nothing new in the last 7 days.
            </p>
          ) : (
            <div>
              {signals.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', gap: 14, padding: '10px 0',
                    borderBottom: idx < signals.length - 1 ? '1px solid var(--btn-secondary-border)' : 'none',
                  }}
                >
                  <div style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10.5, color: 'var(--txt-faint)',
                    paddingTop: 2, whiteSpace: 'nowrap', minWidth: 48,
                  }}>
                    {timeAgo(item.createdAt)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.55 }}>
                    {item.label}
                    {item.projectName && (
                      <> on <strong style={{ color: 'var(--signature)', fontWeight: 500 }}>{item.projectName}</strong></>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

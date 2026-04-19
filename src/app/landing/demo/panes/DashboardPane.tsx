'use client';

import { demoDashboard, demoTeam, demoProjects } from '../mockData';

const PRIORITY_COLOR = { high: 'var(--danger)', med: 'var(--warning)', low: 'var(--success)' } as const;
const PRIORITY_SHADOW = { high: '0 0 5px var(--danger)', med: 'none', low: 'none' } as const;

export default function DashboardPane() {
  const analyzed = demoProjects.length;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h2>Overview</h2>
          <p>
            <strong>{demoTeam.name}</strong> · {demoProjects.length} projects
          </p>
        </div>
      </div>

      {/* Recgon pulse */}
      <div className="glass-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="recgon-label" style={{ margin: 0 }}>recgon&apos;s pulse</span>
          <span style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11, color: 'var(--txt-faint)', letterSpacing: '0.2px',
          }}>
            avg health <strong style={{ color: 'var(--txt-pure)' }}>7.8</strong>
            {' · '}{analyzed} analyzed
            {' · '}<span style={{ color: 'var(--signature)', fontWeight: 600 }}>3 new feedback</span>
          </span>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--txt-pure)', marginBottom: 12 }}>
          {demoDashboard.brief}
        </p>
        <p style={{
          fontSize: 13.5, color: 'var(--signature)', fontWeight: 500,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          paddingTop: 12, borderTop: '1px solid var(--btn-secondary-border)',
          marginBottom: 0,
        }}>
          → Ship the mobile-web plan view for TaskSurge
        </p>

        {/* Analytics deltas */}
        <div style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--btn-secondary-border)',
          display: 'flex', flexWrap: 'wrap', gap: 16,
        }}>
          {demoDashboard.pulse.map((p) => {
            const up = p.delta.startsWith('+');
            return (
              <div key={p.label} style={{
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
                  {p.label}
                </span>
                <span style={{ color: 'var(--txt-muted)' }}>
                  <strong style={{ color: 'var(--txt-pure)', fontWeight: 600 }}>{p.value}</strong>
                </span>
                <span style={{ color: up ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  {up ? '↑' : '↓'} {p.delta.replace(/^[+-]/, '')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Ask input */}
        <form
          onSubmit={(e) => e.preventDefault()}
          style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'stretch' }}
        >
          <input
            placeholder="Ask Recgon…"
            disabled
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
            type="button"
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
            Open terminal
          </button>
        </form>
      </div>

      {/* Actions + Signals */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="glass-card">
          <span className="recgon-label">priority actions</span>
          <div>
            {(() => {
              const groups: { projectName: string; items: typeof demoDashboard.priorityActions }[] = [];
              for (const a of demoDashboard.priorityActions) {
                const last = groups[groups.length - 1];
                if (last && last.projectName === a.project) last.items.push(a);
                else groups.push({ projectName: a.project, items: [a] });
              }
              return groups.map((group, gi) => (
                <div
                  key={group.projectName + gi}
                  style={{
                    paddingTop: gi === 0 ? 4 : 14,
                    paddingBottom: 4,
                    borderTop: gi > 0 ? '1px solid var(--btn-secondary-border)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      background: 'rgba(var(--signature-rgb), 0.08)',
                      border: '1px solid rgba(var(--signature-rgb), 0.2)',
                      color: 'var(--signature)',
                      padding: '2px 9px', borderRadius: 'var(--r-pill)',
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                    }}>
                      {group.projectName}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10.5, color: 'var(--txt-faint)',
                    }}>
                      {group.items.length} action{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {group.items.map((action, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 11,
                        padding: '9px 0',
                        borderBottom: idx < group.items.length - 1 ? '1px dashed var(--btn-secondary-border)' : 'none',
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
                        }}>
                          analysis
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="glass-card">
          <span className="recgon-label">recent signals</span>
          <div>
            {demoDashboard.signals.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex', gap: 14, padding: '10px 0',
                  borderBottom: idx < demoDashboard.signals.length - 1 ? '1px solid var(--btn-secondary-border)' : 'none',
                }}
              >
                <div style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 10.5, color: 'var(--txt-faint)',
                  paddingTop: 2, whiteSpace: 'nowrap', minWidth: 48,
                }}>
                  {item.t}
                </div>
                <div style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.55 }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { demoCampaign } from '../mockData';

type Tab = 'overview' | 'channels' | 'calendar' | 'metrics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'channels',  label: 'Channels' },
  { id: 'calendar',  label: 'Content Calendar' },
  { id: 'metrics',   label: 'Metrics & Budget' },
];

function platformBadgeColor(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('instagram')) return '#e1306c';
  if (l.includes('tiktok'))    return '#2d2d2d';
  if (l.includes('google'))    return '#4285f4';
  if (l.includes('linkedin'))  return '#0a66c2';
  if (l.includes('twitter') || l.includes('x.com') || l.includes('x /')) return '#1da1f2';
  if (l.includes('reddit'))    return '#ff4500';
  if (l.includes('product'))   return '#da552f';
  if (l.includes('email'))     return '#6366f1';
  return '#6b7280';
}

export default function MarketingPane() {
  const [tab, setTab] = useState<Tab>('overview');
  const plan = demoCampaign;

  return (
    <div>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>marketing agent</h2>
        <p>Recgon plans your campaigns — you execute them</p>
      </div>

      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <div style={{ width: 240, flexShrink: 0, paddingRight: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '0.03em', marginBottom: 8 }}>
              // project
            </div>
            <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--btn-secondary-border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--txt-pure)', fontWeight: 500 }}>
              TaskSurge
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '0.03em' }}>
                // campaigns
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--signature)', background: 'rgba(var(--signature-rgb), 0.12)', borderRadius: 10, padding: '1px 7px' }}>
                1
              </span>
            </div>
            <div style={{
              textAlign: 'left',
              border: '1px solid var(--signature)',
              background: 'rgba(var(--signature-rgb), 0.06)',
              padding: '10px 12px',
              borderRadius: 10,
              width: '100%',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(var(--signature-rgb), 0.09)', border: '1px solid rgba(var(--signature-rgb), 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {/* product-launch icon */}
                  <svg width="12" height="12" fill="none" stroke="var(--signature)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M12 2C8 6.5 6.5 10.5 6.5 14a5.5 5.5 0 0 0 11 0c0-3.5-1.5-7.5-5.5-12z"/>
                    <path d="M12 14v7"/><path d="M9 18.5 6 21"/><path d="M15 18.5 18 21"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--signature)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
                    Braindump to Plan
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 1, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                    Product Launch · 1 month
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Campaign header */}
          <div className="glass-card" style={{ marginBottom: 0, borderColor: 'var(--signature)', background: 'rgba(var(--signature-rgb), 0.04)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(var(--signature-rgb), 0.12)', border: '1px solid rgba(var(--signature-rgb), 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <svg width="20" height="20" fill="none" stroke="var(--signature)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M12 2C8 6.5 6.5 10.5 6.5 14a5.5 5.5 0 0 0 11 0c0-3.5-1.5-7.5-5.5-12z"/>
                    <path d="M12 14v7"/><path d="M9 18.5 6 21"/><path d="M15 18.5 18 21"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 0 }}>product launch</span>
                    <span style={{ fontSize: 11, color: 'var(--txt-muted)', background: 'var(--btn-secondary-bg)', padding: '1px 7px', borderRadius: 4, border: '1px solid var(--btn-secondary-border)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>1 month</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--txt-pure)', marginBottom: 5, letterSpacing: '-0.5px' }}>
                    {plan.campaignName}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.55 }}>
                    {plan.summary}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--btn-secondary-border)', marginBottom: 20, padding: '0 32px', background: 'var(--bg-deep)', backdropFilter: 'blur(20px)' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${tab === t.id ? 'var(--signature)' : 'transparent'}`,
                  color: tab === t.id ? 'var(--signature)' : 'var(--txt-muted)',
                  fontWeight: tab === t.id ? 600 : 400,
                  fontSize: 13, padding: '10px 14px', marginBottom: -1,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="glass-card">
                <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 12 }}>target_audience</span>
                <p style={{ margin: '0 0 3px', fontSize: 13, color: 'var(--txt-pure)', fontWeight: 600 }}>{plan.targetAudience.primary}</p>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--txt-muted)' }}>{plan.targetAudience.secondary}</p>
                <div style={{ marginBottom: 12 }}>
                  <span className="recgon-label" style={{ color: 'var(--txt-muted)', marginBottom: 6 }}>pain_points</span>
                  {plan.targetAudience.painPoints.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                      <svg width="12" height="12" fill="none" stroke="#ef4444" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      <span style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.4 }}>{p}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <span className="recgon-label" style={{ color: 'var(--txt-muted)', marginBottom: 6 }}>motivations</span>
                  {plan.targetAudience.motivations.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                      <svg width="12" height="12" fill="none" stroke="#22c55e" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.4 }}>{m}</span>
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
                      <span style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.45 }}>{m}</span>
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
                      <span style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.4 }}>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Channels */}
          {tab === 'channels' && (
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
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.5 }}>{ch.strategy}</p>
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
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--txt-muted)' }}>{phase.objective}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>tactics</div>
                        {phase.tactics.map((tactic, j) => (
                          <div key={j} style={{ fontSize: 12, color: 'var(--txt-muted)', marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid rgba(var(--signature-rgb), 0.3)' }}>{tactic}</div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', marginBottom: 6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>deliverables</div>
                        {phase.keyDeliverables.map((d, j) => (
                          <div key={j} style={{ display: 'flex', gap: 5, fontSize: 12, color: 'var(--txt-muted)', marginBottom: 4 }}>
                            <svg width="10" height="10" fill="none" stroke="var(--signature)" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
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
          {tab === 'calendar' && (
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
                      {items.map((item, idx) => (
                        <div key={idx} className="glass-card" style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span style={{ background: platformBadgeColor(item.platform), color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{item.platform}</span>
                                <span style={{ fontSize: 10, color: 'var(--txt-muted)', background: 'var(--btn-secondary-bg)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--btn-secondary-border)' }}>{item.contentType}</span>
                                <span style={{ fontSize: 10, color: 'var(--signature)', background: 'rgba(var(--signature-rgb), 0.08)', padding: '2px 7px', borderRadius: 4 }}>{item.suggestedFormat}</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-pure)', marginBottom: 2, letterSpacing: '-0.2px' }}>{item.topic}</div>
                              <div style={{ fontSize: 12, color: 'var(--txt-muted)', fontStyle: 'italic', marginBottom: 2 }}>{item.angle}</div>
                              <div style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                                <span style={{ opacity: 0.6 }}>cta:</span> {item.cta}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", flexShrink: 0 }}>manual</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Metrics & Budget */}
          {tab === 'metrics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="glass-card">
                <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 14 }}>kpis</span>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--btn-secondary-border)' }}>
                        {['metric', 'target', 'platform', 'timeframe'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--txt-muted)', fontWeight: 600, fontSize: 11, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.kpis.map((kpi, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--btn-secondary-border)' }}>
                          <td style={{ padding: '9px 10px', color: 'var(--txt-pure)', fontWeight: 500 }}>{kpi.metric}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--signature)', fontWeight: 700, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{kpi.target}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--txt-muted)' }}>{kpi.platform}</td>
                          <td style={{ padding: '9px 10px', color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{kpi.timeframe}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card">
                <span className="recgon-label" style={{ color: 'var(--signature)', marginBottom: 4 }}>budget_guidance</span>
                <p style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 700, color: 'var(--txt-pure)', letterSpacing: '-0.5px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                  {plan.budgetGuidance.totalRecommendation}
                </p>
                {plan.budgetGuidance.breakdown.map((b, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-pure)' }}>{b.channel}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--signature)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{b.percentage}%</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--btn-secondary-border)', borderRadius: 999, marginBottom: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${b.percentage}%`, background: 'var(--signature)', borderRadius: 999 }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{b.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

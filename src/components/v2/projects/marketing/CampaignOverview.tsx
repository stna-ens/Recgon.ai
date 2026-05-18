'use client';

import type { CampaignPlan } from './types';

interface Props {
  plan: CampaignPlan;
}

export default function CampaignOverview({ plan }: Props) {
  return (
    <div className="v2-m-tab-body v2-m-grid-2">
      <section className="glass-card is-static v2-m-section-card">
        <span className="recgon-label v2-m-section-eye">target_audience</span>
        <p className="v2-m-overview-primary">{plan.targetAudience.primary}</p>
        <p className="v2-m-overview-secondary">{plan.targetAudience.secondary}</p>

        <span className="recgon-label v2-m-section-eye">pain_points</span>
        <div className="v2-m-bullet-list">
          {plan.targetAudience.painPoints.map((p, i) => (
            <div key={i} className="v2-m-bullet v2-m-bullet-pain">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>{p}</span>
            </div>
          ))}
        </div>

        <span className="recgon-label v2-m-section-eye">motivations</span>
        <div className="v2-m-bullet-list">
          {plan.targetAudience.motivations.map((m, i) => (
            <div key={i} className="v2-m-bullet v2-m-bullet-motivation">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{m}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="v2-m-section-card">
        <section className="glass-card is-static v2-m-section-card">
          <span className="recgon-label v2-m-section-eye">key_messages</span>
          <div className="v2-m-keymsg-list">
            {plan.keyMessages.map((m, i) => (
              <div key={i} className="v2-m-keymsg">
                <span className="v2-m-keymsg-num">{i + 1}</span>
                <span>{m}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="v2-m-quickwin-card">
          <div className="v2-m-quickwin-head">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>{'quick_wins < 48h'}</span>
          </div>
          <div className="v2-m-quickwin-list">
            {plan.quickWins.map((w, i) => (
              <div key={i} className="v2-m-quickwin-item">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

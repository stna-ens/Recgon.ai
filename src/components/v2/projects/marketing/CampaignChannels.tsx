'use client';

import type { CampaignPlan } from './types';
import { platformBadgeColor } from './utils';

interface Props {
  plan: CampaignPlan;
}

export default function CampaignChannels({ plan }: Props) {
  return (
    <div className="v2-m-tab-body">
      <div className="v2-m-channels-list">
        {plan.channels.map((ch, i) => (
          <article key={i} className="glass-card is-static v2-m-channel-card">
            <div className="v2-m-channel-head">
              <div className="v2-m-channel-head-left">
                <span
                  className="v2-m-platform-badge"
                  style={{ background: platformBadgeColor(ch.platform) }}
                >
                  {ch.platform}
                </span>
                <span className="v2-m-tag">{ch.frequency}</span>
              </div>
              <span className="v2-m-channel-reach">~{ch.estimatedReach}</span>
            </div>
            <p className="v2-m-channel-strategy">{ch.strategy}</p>
            <div className="v2-m-tag-row">
              {ch.contentTypes.map((type, j) => (
                <span key={j} className="v2-m-tag">
                  {type}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <span className="recgon-label v2-m-section-eye">campaign_phases</span>
      <div className="v2-m-phases-list">
        {plan.phases.map((phase, i) => (
          <article key={i} className="glass-card is-static v2-m-phase-card">
            <div className="v2-m-phase-head">
              <span className="v2-m-phase-duration">{phase.duration}</span>
              <span className="v2-m-phase-name">{phase.name}</span>
            </div>
            <p className="v2-m-phase-obj">{phase.objective}</p>
            <div className="v2-m-phase-grid">
              <div>
                <span className="v2-m-phase-col-label">tactics</span>
                {phase.tactics.map((tactic, j) => (
                  <div key={j} className="v2-m-phase-tactic">
                    {tactic}
                  </div>
                ))}
              </div>
              <div>
                <span className="v2-m-phase-col-label">deliverables</span>
                {phase.keyDeliverables.map((d, j) => (
                  <div key={j} className="v2-m-phase-deliv">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

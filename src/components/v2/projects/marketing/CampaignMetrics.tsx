'use client';

import type { CampaignPlan } from './types';

interface Props {
  plan: CampaignPlan;
}

export default function CampaignMetrics({ plan }: Props) {
  return (
    <div className="v2-m-tab-body v2-m-metrics">
      <section className="glass-card is-static v2-m-section-card">
        <span className="recgon-label v2-m-section-eye">kpis</span>
        <div className="v2-m-kpi-wrap">
          <table className="v2-m-kpi-table">
            <thead>
              <tr>
                <th>metric</th>
                <th>target</th>
                <th>platform</th>
                <th>timeframe</th>
              </tr>
            </thead>
            <tbody>
              {plan.kpis.map((kpi, i) => (
                <tr key={i}>
                  <td className="v2-m-kpi-metric">{kpi.metric}</td>
                  <td className="v2-m-kpi-target">{kpi.target}</td>
                  <td className="v2-m-kpi-platform">{kpi.platform}</td>
                  <td className="v2-m-kpi-time">{kpi.timeframe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card is-static v2-m-section-card">
        <span className="recgon-label v2-m-section-eye">budget_guidance</span>
        <p className="v2-m-budget-total">{plan.budgetGuidance.totalRecommendation}</p>
        {plan.budgetGuidance.breakdown.map((b, i) => (
          <div key={i} className="v2-m-budget-row">
            <div className="v2-m-budget-head">
              <span className="v2-m-budget-channel">{b.channel}</span>
              <span className="v2-m-budget-pct">{b.percentage}%</span>
            </div>
            <div className="v2-m-budget-bar">
              <div className="v2-m-budget-fill" style={{ width: `${b.percentage}%` }} />
            </div>
            <p className="v2-m-budget-rationale">{b.rationale}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

'use client';

export default function RisksSection({ topRisks }: { topRisks: string[] }) {
  if (!topRisks || topRisks.length === 0) return null;
  return (
    <section className="v2-section">
      <div className="v2-section-head">
        <span className="recgon-label v2-eyebrow">› watch out</span>
      </div>
      <div className="glass-card is-static is-roomy v2-risk">
        <div className="v2-risk-legend">
          <span className="v2-risk-leg"><span className="v2-risk-leg-dot v2-risk-sev-3" /> high</span>
          <span className="v2-risk-leg"><span className="v2-risk-leg-dot v2-risk-sev-2" /> medium</span>
          <span className="v2-risk-leg"><span className="v2-risk-leg-dot v2-risk-sev-1" /> low</span>
        </div>
        <ol className="v2-risk-list">
          {topRisks.map((r, i) => {
            const sev = i === 0 ? 3 : i < 3 ? 2 : 1;
            return (
              <li key={i} className={`v2-risk-row v2-risk-sev-${sev}`}>
                <span className="v2-risk-id">R{String(i + 1).padStart(2, '0')}</span>
                <span className="v2-risk-bars" aria-label={`severity ${sev} of 3`}>
                  <span className={`v2-risk-bar ${sev >= 1 ? 'is-on' : ''}`} />
                  <span className={`v2-risk-bar ${sev >= 2 ? 'is-on' : ''}`} />
                  <span className={`v2-risk-bar ${sev >= 3 ? 'is-on' : ''}`} />
                </span>
                <span className="v2-risk-text">{r}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

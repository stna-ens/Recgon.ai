'use client';

// First-paint skeleton. Header eyebrow + loading hero, then a tall setup
// placeholder. Mirrors AnalyticsSkeleton in shape and animation.
export default function MarketingSkeleton() {
  return (
    <div className="v2-m">
      <header className="v2-m-head">
        <div>
          <span className="recgon-label v2-m-eye">› marketing</span>
          <h2 className="v2-m-hero">
            <span>loading…</span>
          </h2>
        </div>
      </header>
      <div className="glass-card is-static v2-m-skel-tall" />
    </div>
  );
}

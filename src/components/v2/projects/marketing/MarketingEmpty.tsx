'use client';

export default function MarketingEmpty() {
  return (
    <div className="v2-m">
      <header className="v2-m-head">
        <div>
          <span className="recgon-label v2-m-eye">› marketing</span>
          <h2 className="v2-m-hero">
            <span>this project isn&apos;t analyzed yet.</span>
          </h2>
          <p className="v2-m-sub">
            analyze the project to unlock campaign planning, channel strategy, and content generation.
          </p>
        </div>
      </header>

      <div className="v2-m-empty">
        <span className="v2-m-empty-icon" aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
            <circle cx="12" cy="12" r="2" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
          </svg>
        </span>
        <div>
          <h3>analyze first.</h3>
          <p>
            Recgon needs to read the codebase + project signals before it can draft strategy. Once the
            analysis is in, this page unlocks: campaign types, audience inference, channel plan, weekly
            content calendar, and KPI targets.
          </p>
        </div>
      </div>
    </div>
  );
}

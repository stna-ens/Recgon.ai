'use client';

const STEPS = [
  {
    num: '01',
    title: 'Connect.',
    body: 'Link your GitHub repo and GA4 property. Add your teammates with their roles. Takes about a minute.',
  },
  {
    num: '02',
    title: 'Analyze.',
    body: 'Recgon reads the code and the traffic. It surfaces stage, top risks, growth levers, and a ranked next-step list per project.',
  },
  {
    num: '03',
    title: 'Act.',
    body: 'Tasks land on the right teammate’s calendar. You see what shipped, what slipped, and what to look at tomorrow. Repeat daily.',
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="lnd-how">
      <div className="lnd-how-head">
        <span className="recgon-label">three steps</span>
        <h2 className="lnd-how-title">From repo to assigned task in minutes.</h2>
      </div>

      <ol className="lnd-how-list">
        {STEPS.map(({ num, title, body }) => (
          <li key={num} className="glass-card lnd-how-step">
            <span className="lnd-how-num">{num}</span>
            <div className="lnd-how-text">
              <h3 className="lnd-how-step-title">{title}</h3>
              <p className="lnd-how-step-body">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <style>{`
        .lnd-how {
          padding: 64px 24px 88px;
          max-width: 880px;
          margin: 0 auto;
        }
        .lnd-how-head {
          max-width: 640px;
          margin: 0 auto 40px;
          text-align: center;
        }
        .lnd-how-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.4rem, 2.8vw, 1.9rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.2;
        }
        .lnd-how-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .lnd-how-step {
          padding: 22px 26px !important;
          display: flex;
          align-items: flex-start;
          gap: 22px;
        }
        .lnd-how-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 28px;
          font-weight: 700;
          color: var(--signature);
          letter-spacing: -0.02em;
          line-height: 1;
          opacity: 0.7;
          flex-shrink: 0;
          padding-top: 2px;
        }
        .lnd-how-text { min-width: 0; }
        .lnd-how-step-title {
          margin: 0 0 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 15.5px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.015em;
        }
        .lnd-how-step-body {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--txt-muted);
        }
        @media (max-width: 640px) {
          .lnd-how { padding: 56px 18px; }
          .lnd-how-step { padding: 18px !important; gap: 16px; }
          .lnd-how-num { font-size: 22px; }
        }
      `}</style>
    </section>
  );
}

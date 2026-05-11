'use client';

import * as Accordion from '@radix-ui/react-accordion';

const FAQ = [
  {
    q: 'What is Recgon?',
    a: 'Recgon is an AI Product Manager for small teams. It reads your codebase, GA4 analytics, and team activity, then surfaces what to ship next and automatically assigns each task to the best-fit teammate by skill and calendar.',
  },
  {
    q: 'How does the analysis work?',
    a: 'Connect a GitHub repo and a GA4 property. Recgon ingests the code and the traffic, builds a running snapshot of your product (stage, SWOT, top risks, growth levers, prioritized next steps), and refreshes it whenever new commits land.',
  },
  {
    q: 'How does task assignment work?',
    a: 'Each task is scored against every active teammate by skill match, current workload, and open time on their calendar. The best fit gets assigned and pinged. If no teammate scores above the minimum fit threshold, the task is left unassigned for you to triage.',
  },
  {
    q: 'Does Recgon do the work itself?',
    a: 'No. Recgon assigns work to humans. It plans, prioritizes, schedules, and verifies — your team ships.',
  },
  {
    q: 'Is there a Claude Code integration?',
    a: 'Yes. Recgon ships an MCP server so Claude Code can read your product analysis, pick up an actionable next step, implement it, and mark it complete — all tracked back in Recgon.',
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="lnd-faq">
      <div className="lnd-faq-head">
        <span className="recgon-label">questions</span>
        <h2 className="lnd-faq-title">Common questions.</h2>
      </div>

      <Accordion.Root type="single" collapsible className="lnd-faq-list">
        {FAQ.map(({ q, a }, i) => (
          <Accordion.Item key={i} value={`item-${i}`} className="lnd-faq-item">
            <Accordion.Header>
              <Accordion.Trigger className="lnd-faq-trigger">
                <span>{q}</span>
                <svg className="lnd-faq-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="lnd-faq-content">
              <div className="lnd-faq-body">{a}</div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>

      <style>{`
        .lnd-faq {
          padding: 64px 24px 64px;
          max-width: 720px;
          margin: 0 auto;
        }
        .lnd-faq-head {
          max-width: 640px;
          margin: 0 auto 36px;
          text-align: center;
        }
        .lnd-faq-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.4rem, 2.8vw, 1.9rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.2;
        }
        .lnd-faq-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lnd-faq-item {
          border: 1px solid rgba(var(--signature-rgb), 0.12);
          background: var(--bg-content);
          backdrop-filter: blur(30px) saturate(160%);
          -webkit-backdrop-filter: blur(30px) saturate(160%);
          border-radius: 12px;
          overflow: hidden;
        }
        .lnd-faq-trigger {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          width: 100%;
          padding: 18px 22px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
          cursor: pointer;
          transition: background .2s ease;
        }
        .lnd-faq-trigger:hover { background: rgba(var(--signature-rgb), 0.04); }
        .lnd-faq-chev {
          color: var(--signature);
          transition: transform .25s var(--ease-out);
          flex-shrink: 0;
        }
        .lnd-faq-trigger[data-state='open'] .lnd-faq-chev { transform: rotate(180deg); }
        .lnd-faq-content {
          overflow: hidden;
        }
        .lnd-faq-content[data-state='open'] {
          animation: lndFaqDown .25s var(--ease-out);
        }
        .lnd-faq-content[data-state='closed'] {
          animation: lndFaqUp .2s var(--ease-out);
        }
        @keyframes lndFaqDown {
          from { height: 0; }
          to { height: var(--radix-accordion-content-height); }
        }
        @keyframes lndFaqUp {
          from { height: var(--radix-accordion-content-height); }
          to { height: 0; }
        }
        .lnd-faq-body {
          padding: 0 22px 18px;
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--txt-muted);
        }
        @media (max-width: 640px) {
          .lnd-faq { padding: 56px 18px; }
          .lnd-faq-trigger { padding: 16px 18px; font-size: 12.5px; }
          .lnd-faq-body { padding: 0 18px 16px; }
        }
      `}</style>
    </section>
  );
}

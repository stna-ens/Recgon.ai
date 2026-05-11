'use client';

const TRANSCRIPT: { kind: 'cmd' | 'out' | 'note' | 'ok'; text: string }[] = [
  { kind: 'cmd', text: '/analyze https://github.com/acme/storefront' },
  { kind: 'note', text: '# reading codebase · 384 files · 18.2k loc' },
  { kind: 'out', text: 'stage: growth · top risk: webhook retries silently drop' },
  { kind: 'out', text: 'growth lever: switch checkout to single-page (3 of 4 funnel tests favour it)' },
  { kind: 'note', text: '# matching teammates by skill + calendar' },
  { kind: 'ok', text: '→ assigned 4 tasks · 3 owners · 1 unassigned (no fit above 0.6)' },
];

export default function TerminalPreviewSection() {
  return (
    <section id="terminal" className="lnd-term">
      <div className="lnd-term-head">
        <span className="recgon-label">the terminal, for when you&apos;d rather just type</span>
        <h2 className="lnd-term-title">Same brain. Command-line interface.</h2>
        <p className="lnd-term-sub">
          Every analysis, every assignment, every report is one slash away.
          Type <code>/analyze</code>, <code>/analytics</code>, or just ask in plain English.
        </p>
      </div>

      <div className="lnd-term-frame">
        <header className="lnd-term-bar">
          <span className="lnd-term-light" data-c="r" />
          <span className="lnd-term-light" data-c="y" />
          <span className="lnd-term-light" data-c="g" />
          <span className="lnd-term-title-text">recgon — terminal</span>
        </header>
        <div className="lnd-term-body">
          {TRANSCRIPT.map((line, i) => (
            <div key={i} className={`lnd-term-line lnd-term-${line.kind}`} style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
              {line.kind === 'cmd' && <span className="lnd-term-prompt">$</span>}
              <span>{line.text}</span>
            </div>
          ))}
          <div className="lnd-term-line lnd-term-cmd lnd-term-cursor-line" style={{ animationDelay: `${0.1 + TRANSCRIPT.length * 0.12}s` }}>
            <span className="lnd-term-prompt">$</span>
            <span className="lnd-term-cursor" aria-hidden="true" />
          </div>
        </div>
      </div>

      <style>{`
        .lnd-term {
          padding: 64px 24px 88px;
          max-width: 880px;
          margin: 0 auto;
        }
        .lnd-term-head {
          max-width: 640px;
          margin: 0 auto 36px;
          text-align: center;
        }
        .lnd-term-title {
          margin: 0 0 12px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.4rem, 2.8vw, 1.9rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.2;
        }
        .lnd-term-sub {
          margin: 0;
          font-size: 14.5px;
          line-height: 1.55;
          color: var(--txt-muted);
        }
        .lnd-term-sub code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          color: var(--signature);
          background: rgba(var(--signature-rgb), 0.08);
          padding: 1px 6px;
          border-radius: 4px;
          margin: 0 2px;
        }

        .lnd-term-frame {
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-deep);
          border: 1px solid rgba(var(--signature-rgb), 0.15);
          box-shadow:
            0 24px 60px -20px rgba(0,0,0,0.18),
            0 0 0 1px rgba(var(--signature-rgb), 0.06);
        }
        .lnd-term-bar {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 11px 16px;
          background: rgba(var(--signature-rgb), 0.04);
          border-bottom: 1px solid rgba(var(--signature-rgb), 0.1);
        }
        .lnd-term-light {
          width: 11px;
          height: 11px;
          border-radius: 50%;
        }
        .lnd-term-light[data-c='r'] { background: #ff5f57; }
        .lnd-term-light[data-c='y'] { background: #febc2e; }
        .lnd-term-light[data-c='g'] { background: #28c840; }
        .lnd-term-title-text {
          margin-left: 12px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11.5px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
        }
        .lnd-term-body {
          padding: 22px 24px 26px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.85;
        }
        .lnd-term-line {
          display: flex;
          gap: 10px;
          opacity: 0;
          transform: translateY(2px);
          animation: lndTermFade .35s var(--ease-out) forwards;
        }
        @keyframes lndTermFade { to { opacity: 1; transform: translateY(0); } }
        .lnd-term-prompt { color: var(--signature); flex-shrink: 0; font-weight: 700; }
        .lnd-term-cmd { color: var(--txt-pure); }
        .lnd-term-out { color: var(--txt-muted); padding-left: 18px; }
        .lnd-term-note { color: var(--txt-faint); font-style: italic; padding-left: 18px; opacity: 0.85; }
        .lnd-term-ok { color: var(--success, #059669); padding-left: 18px; font-weight: 600; }

        .lnd-term-cursor {
          display: inline-block;
          width: 7px;
          height: 14px;
          background: var(--signature);
          vertical-align: middle;
          animation: lndTermBlink 1s steps(2) infinite;
        }
        @keyframes lndTermBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        @media (max-width: 640px) {
          .lnd-term { padding: 56px 18px; }
          .lnd-term-body { padding: 18px; font-size: 11.5px; }
          .lnd-term-out, .lnd-term-note, .lnd-term-ok { padding-left: 12px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lnd-term-line, .lnd-term-cursor { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </section>
  );
}

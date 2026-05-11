'use client';

import { Eye, Brain, UserCheck, ShieldCheck } from 'lucide-react';

const TILES = [
  {
    icon: Eye,
    label: 'read',
    title: 'Reads everything that matters.',
    body: 'Codebase, GA4 traffic, commit history, team activity — Recgon ingests all of it into one running snapshot.',
  },
  {
    icon: Brain,
    label: 'decide',
    title: 'Decides what matters today.',
    body: 'A senior-PM model picks the single project that needs attention, surfaces the top risk, and ranks the next moves — every morning.',
  },
  {
    icon: UserCheck,
    label: 'assign',
    title: 'Assigns to the right teammate.',
    body: 'Each task is scored against every teammate by skill match, current load, and free time on their calendar. The right person gets pinged.',
  },
  {
    icon: ShieldCheck,
    label: 'verify',
    title: 'Verifies the work is done.',
    body: 'When a teammate marks a task done, Recgon checks the evidence against the original acceptance criteria — no silent slips.',
  },
];

export default function CapabilitiesSection() {
  return (
    <section id="capabilities" className="lnd-caps">
      <div className="lnd-caps-head">
        <span className="recgon-label">what it actually does</span>
        <h2 className="lnd-caps-title">A PM that never sleeps and never forgets.</h2>
      </div>

      <div className="lnd-caps-grid">
        {TILES.map(({ icon: Icon, label, title, body }) => (
          <article key={label} className="glass-card lnd-caps-tile">
            <span className="lnd-caps-icon"><Icon size={20} strokeWidth={2} /></span>
            <span className="recgon-label lnd-caps-label">{label}</span>
            <h3 className="lnd-caps-tile-title">{title}</h3>
            <p className="lnd-caps-body">{body}</p>
          </article>
        ))}
      </div>

      <style>{`
        .lnd-caps {
          padding: 88px 24px 64px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .lnd-caps-head {
          max-width: 640px;
          margin: 0 auto 48px;
          text-align: center;
        }
        .lnd-caps-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.4rem, 2.8vw, 1.9rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.18;
        }

        .lnd-caps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 18px;
        }
        .lnd-caps-tile {
          padding: 22px !important;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 200px;
        }
        .lnd-caps-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(var(--signature-rgb), 0.1);
          color: var(--signature);
        }
        .lnd-caps-label {
          margin: 0;
          font-size: 10px;
          opacity: 0.9;
        }
        .lnd-caps-tile-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14.5px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.015em;
          line-height: 1.3;
        }
        .lnd-caps-body {
          margin: 0;
          font-size: 13px;
          line-height: 1.55;
          color: var(--txt-muted);
        }

        @media (max-width: 640px) {
          .lnd-caps { padding: 56px 18px; }
        }
      `}</style>
    </section>
  );
}

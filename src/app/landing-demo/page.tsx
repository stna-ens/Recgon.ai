import type { Metadata } from 'next';
import Link from 'next/link';
import DemoShell from '@/app/landing/demo/DemoShell';
import {
  cannedPairs,
  demoAnalytics,
  demoCampaign,
  demoDashboard,
  demoFeedback,
  demoMarketing,
  demoProjects,
} from '@/app/landing/demo/mockData';
import RecgonLogo from '@/components/RecgonLogo';

export const metadata: Metadata = {
  title: 'Landing Demo',
  description:
    'A standalone Recgon landing-page demo built to match the app itself and show the full founder workflow.',
};

const intakeModes = [
  'GitHub repo',
  'Local codebase',
  'Idea brief',
  'Feedback queue',
  'GA4 property',
  'Agent context',
];

const workspaceNotes = [
  {
    title: 'Overview',
    body: 'The pulse, the priorities, and the recent signals in one glance.',
  },
  {
    title: 'Terminal',
    body: 'A mentor that already knows the projects, the campaigns, the feedback, and the traffic.',
  },
  {
    title: 'Projects',
    body: 'Real product dossiers: target audience, pricing, risks, SWOT, GTM, and next steps.',
  },
  {
    title: 'Marketing',
    body: 'Channel-specific copy and campaigns grounded in the analysis rather than guessed from a prompt.',
  },
  {
    title: 'Feedback',
    body: 'Themes, bugs, feature requests, and developer prompts that are ready to ship against.',
  },
  {
    title: 'Analytics',
    body: 'GA4 charts plus the top win, top concern, and what to do next.',
  },
];

const agentTools = [
  {
    name: 'list_projects',
    body: 'Start from the real workspace inventory instead of a blank context window.',
  },
  {
    name: 'get_project_analysis',
    body: 'Pull the full Recgon dossier: audience, moat, risks, GTM, and prioritized next steps.',
  },
  {
    name: 'get_actionable_items',
    body: 'Ask one sharp question: what should be worked on right now?',
  },
  {
    name: 'mark_item_complete',
    body: 'Write evidence back into Recgon once the implementation lands.',
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="recgon-label" style={{ marginBottom: 12 }}>{children}</span>;
}

function TopNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="demo-dock-link">
      {children}
    </a>
  );
}

function RailItem({
  title,
  body,
  index,
}: {
  title: string;
  body: string;
  index: string;
}) {
  return (
    <div className="demo-rail-item">
      <div className="demo-rail-index">{index}</div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

export default function LandingDemoPage() {
  const leadProject = demoProjects[0];
  const secondProject = demoProjects[1];

  return (
    <div className="light recgon-demo-page">
      <style>{`
        html {
          scroll-behavior: smooth;
        }

        .recgon-demo-page {
          position: relative;
          width: 100%;
          min-height: 100vh;
          color: var(--txt-pure);
          background:
            radial-gradient(circle at 0% 0%, rgba(0, 122, 255, 0.14), transparent 28%),
            radial-gradient(circle at 100% 8%, rgba(var(--signature-rgb), 0.24), transparent 22%),
            linear-gradient(180deg, #f4f5f8 0%, #f1f2f7 26%, #ffffff 100%);
          overflow: hidden;
        }

        .recgon-demo-page::before,
        .recgon-demo-page::after {
          content: '';
          position: fixed;
          width: 440px;
          height: 440px;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.5;
        }

        .recgon-demo-page::before {
          top: -180px;
          left: -120px;
          background: rgba(0, 122, 255, 0.12);
        }

        .recgon-demo-page::after {
          top: 140px;
          right: -120px;
          background: rgba(var(--signature-rgb), 0.18);
        }

        .demo-shell {
          position: relative;
          z-index: 1;
          width: min(1360px, calc(100% - 32px));
          margin: 0 auto;
        }

        .demo-header {
          position: sticky;
          top: 0;
          z-index: 30;
          padding: 20px 0 10px;
          backdrop-filter: blur(18px) saturate(180%);
          -webkit-backdrop-filter: blur(18px) saturate(180%);
        }

        .demo-header-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 16px;
          align-items: center;
        }

        .demo-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.66);
          border: 1px solid rgba(0, 0, 0, 0.06);
          text-decoration: none;
          color: inherit;
          box-shadow: 0 14px 30px -22px rgba(0, 0, 0, 0.22);
        }

        .demo-brand-title {
          display: block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.6px;
        }

        .demo-brand-meta {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: var(--txt-muted);
        }

        .demo-dock {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          border-radius: 999px;
          background: var(--glass-substrate);
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
          min-width: 0;
          justify-self: center;
        }

        .demo-dock-link {
          padding: 10px 15px;
          border-radius: 999px;
          color: var(--txt-muted);
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.2px;
          transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
        }

        .demo-dock-link:hover {
          background: rgba(var(--signature-rgb), 0.08);
          color: var(--txt-pure);
          transform: translateY(-1px);
        }

        .demo-header-actions {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          justify-self: end;
        }

        .demo-link-btn {
          text-decoration: none;
        }

        .demo-page-block {
          padding: 34px 0 72px;
        }

        .demo-hero {
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(360px, 0.7fr);
          gap: 22px;
          align-items: stretch;
          margin-bottom: 24px;
        }

        .demo-hero-copy {
          padding: 12px 4px 0;
        }

        .demo-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.66);
          border: 1px solid rgba(0, 0, 0, 0.06);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--txt-muted);
          margin-bottom: 18px;
        }

        .demo-hero-badge b {
          color: var(--signature);
        }

        .demo-hero-copy h1 {
          font-size: clamp(3.4rem, 8vw, 6.5rem);
          line-height: 0.9;
          letter-spacing: -0.08em;
          margin: 0 0 22px;
          max-width: 900px;
        }

        .demo-hero-copy h1 span {
          color: var(--signature);
        }

        .demo-hero-copy p {
          max-width: 760px;
          margin: 0 0 24px;
          font-size: 17px;
          line-height: 1.85;
          color: var(--text-secondary);
        }

        .demo-intake-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 0 0 24px;
        }

        .demo-intake-chip {
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.66);
          border: 1px solid rgba(0, 0, 0, 0.06);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-muted);
        }

        .demo-cta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .demo-command-board {
          display: grid;
          gap: 16px;
          align-content: start;
        }

        .demo-focus-card {
          padding: 26px;
        }

        .demo-pulse-line {
          font-size: 15px;
          line-height: 1.85;
          color: var(--txt-pure);
          margin: 0 0 16px;
        }

        .demo-stat-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .demo-stat {
          border-radius: 18px;
          background: rgba(var(--signature-rgb), 0.06);
          border: 1px solid rgba(var(--signature-rgb), 0.16);
          padding: 14px 16px;
        }

        .demo-stat strong {
          display: block;
          font-size: 26px;
          letter-spacing: -0.05em;
          line-height: 1;
          margin-bottom: 8px;
        }

        .demo-stat span {
          display: block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .demo-mini-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .demo-mini-panel {
          border-radius: 22px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.56);
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .demo-mini-panel p,
        .demo-mini-panel ul {
          margin: 0;
          font-size: 13px;
          line-height: 1.75;
          color: var(--txt-pure);
        }

        .demo-mini-panel ul {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .demo-mini-panel li {
          position: relative;
          padding-left: 14px;
        }

        .demo-mini-panel li::before {
          content: '›';
          position: absolute;
          left: 0;
          color: var(--signature);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }

        .demo-workspace-stage {
          margin-top: 10px;
          padding: 18px;
          border-radius: 34px;
          background: rgba(255, 255, 255, 0.42);
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 40px 90px -54px rgba(0, 0, 0, 0.36);
          overflow-x: auto;
        }

        .demo-workspace-stage > div {
          min-width: 980px;
        }

        .demo-section {
          padding-top: 68px;
        }

        .demo-section-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(300px, 0.52fr);
          gap: 24px;
          align-items: end;
          margin-bottom: 22px;
        }

        .demo-section-grid h2 {
          font-size: clamp(2.2rem, 5vw, 4.2rem);
          line-height: 0.94;
          letter-spacing: -0.07em;
          margin: 0;
        }

        .demo-section-grid p {
          margin: 0;
          font-size: 15px;
          line-height: 1.85;
          color: var(--text-secondary);
          max-width: 520px;
        }

        .demo-mosaic {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 18px;
        }

        .demo-mosaic-card {
          padding: 28px;
          min-width: 0;
        }

        .span-7 {
          grid-column: span 7;
        }

        .span-5 {
          grid-column: span 5;
        }

        .span-4 {
          grid-column: span 4;
        }

        .span-6 {
          grid-column: span 6;
        }

        .span-8 {
          grid-column: span 8;
        }

        .demo-mosaic-card h3 {
          font-size: 30px;
          line-height: 1;
          letter-spacing: -0.05em;
          margin: 0 0 16px;
        }

        .demo-mosaic-card p {
          margin: 0;
          font-size: 14px;
          line-height: 1.78;
          color: var(--text-secondary);
        }

        .demo-project-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .demo-stage-chip {
          flex-shrink: 0;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(var(--signature-rgb), 0.08);
          border: 1px solid rgba(var(--signature-rgb), 0.16);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--signature);
          letter-spacing: 0.5px;
        }

        .demo-stack-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 16px;
        }

        .demo-stack-item {
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.58);
          border: 1px solid rgba(0, 0, 0, 0.05);
          font-size: 13px;
          line-height: 1.65;
          color: var(--txt-pure);
        }

        .demo-split-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 18px;
        }

        .demo-subcard {
          padding: 18px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.58);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .demo-subcard p {
          color: var(--txt-pure);
          font-size: 13px;
          line-height: 1.72;
        }

        .demo-kpi-list,
        .demo-plain-list {
          list-style: none;
          padding: 0;
          margin: 16px 0 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .demo-kpi-list li,
        .demo-plain-list li {
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.58);
          border: 1px solid rgba(0, 0, 0, 0.05);
          font-size: 13px;
          line-height: 1.65;
          color: var(--txt-pure);
        }

        .demo-workspace-layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }

        .demo-rail {
          position: sticky;
          top: 100px;
          display: grid;
          gap: 14px;
        }

        .demo-rail-item {
          display: grid;
          grid-template-columns: 46px 1fr;
          gap: 12px;
          padding: 18px 18px 18px 16px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.64);
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 18px 32px -24px rgba(0, 0, 0, 0.16);
        }

        .demo-rail-index {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          background: rgba(var(--signature-rgb), 0.08);
          border: 1px solid rgba(var(--signature-rgb), 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          color: var(--signature);
        }

        .demo-rail-item h3 {
          margin: 2px 0 8px;
          font-size: 18px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .demo-rail-item p {
          margin: 0;
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-secondary);
        }

        .demo-agent-band {
          position: relative;
          overflow: hidden;
          margin-top: 18px;
          border-radius: 34px;
          padding: 30px;
          background: linear-gradient(180deg, #050505 0%, #111 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 40px 90px -46px rgba(0, 0, 0, 0.58);
          color: #fff;
        }

        .demo-agent-band::before {
          content: '';
          position: absolute;
          top: -130px;
          right: -90px;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(240, 184, 208, 0.26) 0%, rgba(240, 184, 208, 0) 72%);
          pointer-events: none;
        }

        .demo-agent-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 0.85fr) minmax(320px, 1.15fr);
          gap: 22px;
          align-items: start;
        }

        .demo-agent-grid h2 {
          font-size: clamp(2.2rem, 5vw, 4.1rem);
          line-height: 0.94;
          letter-spacing: -0.07em;
          margin: 0 0 16px;
        }

        .demo-agent-grid p {
          margin: 0 0 16px;
          font-size: 15px;
          line-height: 1.85;
          color: rgba(255, 255, 255, 0.74);
        }

        .demo-agent-tools {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 18px;
        }

        .demo-agent-tool {
          border-radius: 18px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .demo-agent-tool strong {
          display: block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: #f0b8d0;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin-bottom: 8px;
        }

        .demo-agent-tool p {
          margin: 0;
          font-size: 13px;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.82);
        }

        .demo-agent-terminal {
          border-radius: 26px;
          padding: 22px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }

        .demo-agent-terminal pre {
          margin: 0;
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.86;
          color: rgba(255, 255, 255, 0.92);
        }

        .demo-close {
          padding: 72px 0 90px;
        }

        .demo-close-card {
          text-align: center;
          padding: 42px;
        }

        .demo-close-card h2 {
          font-size: clamp(2.1rem, 5vw, 4.2rem);
          line-height: 0.95;
          letter-spacing: -0.07em;
          margin: 0 0 16px;
        }

        .demo-close-card p {
          max-width: 760px;
          margin: 0 auto 24px;
          font-size: 15px;
          line-height: 1.85;
          color: var(--text-secondary);
        }

        .demo-close-actions {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        @media (max-width: 1100px) {
          .demo-header-row,
          .demo-hero,
          .demo-section-grid,
          .demo-workspace-layout,
          .demo-agent-grid {
            grid-template-columns: 1fr;
          }

          .demo-dock {
            justify-self: start;
          }

          .demo-header-actions {
            justify-self: start;
          }

          .demo-mosaic .span-7,
          .demo-mosaic .span-5,
          .demo-mosaic .span-4,
          .demo-mosaic .span-6,
          .demo-mosaic .span-8 {
            grid-column: span 12;
          }

          .demo-rail {
            position: static;
          }
        }

        @media (max-width: 820px) {
          .demo-shell {
            width: min(100% - 20px, 100%);
          }

          .demo-header {
            padding-top: 14px;
          }

          .demo-dock {
            display: none;
          }

          .demo-page-block {
            padding-top: 24px;
          }

          .demo-stat-strip,
          .demo-mini-grid,
          .demo-split-grid,
          .demo-agent-tools {
            grid-template-columns: 1fr;
          }

          .demo-workspace-stage {
            padding: 12px;
          }

          .demo-agent-band,
          .demo-close-card {
            padding: 24px;
          }
        }
      `}</style>

      <header className="demo-header">
        <div className="demo-shell demo-header-row">
          <Link href="/landing-demo" className="demo-brand">
            <span style={{ color: 'var(--signature)' }}>
              <RecgonLogo size={26} uid="landing-demo-brand-v2" />
            </span>
            <span>
              <span className="demo-brand-title">RECGON</span>
              <span className="demo-brand-meta">founder operating system / current landing untouched</span>
            </span>
          </Link>

          <nav className="demo-dock" aria-label="Sections">
            <TopNavLink href="#control-room">Control Room</TopNavLink>
            <TopNavLink href="#workspace">Workspace</TopNavLink>
            <TopNavLink href="#agent-loop">Agent Loop</TopNavLink>
          </nav>

          <div className="demo-header-actions">
            <Link href="/register" className="btn btn-secondary btn-sm demo-link-btn">
              Create account
            </Link>
            <a href="#workspace" className="btn btn-primary btn-sm demo-link-btn">
              Open the workspace
            </a>
          </div>
        </div>
      </header>

      <main className="demo-shell demo-page-block">
        <section className="demo-hero">
          <div className="demo-hero-copy">
            <div className="demo-hero-badge">
              <b>//</b> repo + strategy + launch + feedback + analytics + agent
            </div>
            <h1>
              Your product,
              <br />
              your market,
              <br />
              your users,
              <br />
              your next <span>move.</span>
            </h1>
            <p>
              Recgon is not just “analyze my repo” and it is not just “generate some marketing.”
              It is the place where the repo, the positioning, the campaigns, the feedback, the
              traffic, and the coding agent stop contradicting each other and start reading from
              the same page.
            </p>

            <div className="demo-intake-row">
              {intakeModes.map((mode) => (
                <span key={mode} className="demo-intake-chip">
                  {mode}
                </span>
              ))}
            </div>

            <div className="demo-cta-row">
              <a href="#control-room" className="btn btn-primary demo-link-btn">
                See the control room
              </a>
              <a href="#agent-loop" className="btn btn-secondary demo-link-btn">
                See the agent loop
              </a>
            </div>
          </div>

          <div className="demo-command-board">
            <div className="glass-card demo-focus-card">
              <SectionLabel>recgon&apos;s pulse</SectionLabel>
              <p className="demo-pulse-line">{demoDashboard.brief}</p>
              <div className="demo-stat-strip">
                {demoDashboard.pulse.map((metric) => (
                  <div key={metric.label} className="demo-stat">
                    <strong>{metric.value}</strong>
                    <span>
                      {metric.label} {metric.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="demo-mini-grid">
              <div className="demo-mini-panel">
                <SectionLabel>what recgon knows</SectionLabel>
                <ul>
                  <li>{leadProject.analysis.targetAudience}</li>
                  <li>{demoAnalytics.insights.topConcern}</li>
                  <li>{demoFeedback.developerPrompts[0]}</li>
                </ul>
              </div>

              <div className="demo-mini-panel">
                <SectionLabel>what recgon says next</SectionLabel>
                <p>
                  {cannedPairs[0]?.answer}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="workspace">
          <div className="demo-workspace-stage">
            <DemoShell />
          </div>
        </section>

        <section id="control-room" className="demo-section">
          <div className="demo-section-grid">
            <div>
              <SectionLabel>founder control room</SectionLabel>
              <h2>Not a feature list. A stack of live surfaces.</h2>
            </div>
            <p>
              The page below is built like the product is built: dossiers, prompts, launch
              surfaces, and traffic truth layered together. This is where Recgon stops feeling like
              a generic AI wrapper.
            </p>
          </div>

          <div className="demo-mosaic">
            <div className="glass-card demo-mosaic-card span-7">
              <div className="demo-project-head">
                <div>
                  <SectionLabel>project dossier</SectionLabel>
                  <h3>{leadProject.analysis.name}</h3>
                  <p>{leadProject.analysis.description}</p>
                </div>
                <span className="demo-stage-chip">{leadProject.analysis.currentStage}</span>
              </div>

              <div className="demo-split-grid">
                <div className="demo-subcard">
                  <SectionLabel>positioning</SectionLabel>
                  <p>{leadProject.analysis.uniqueSellingPoints[0]}</p>
                </div>
                <div className="demo-subcard">
                  <SectionLabel>pricing suggestion</SectionLabel>
                  <p>{leadProject.analysis.pricingSuggestion}</p>
                </div>
              </div>

              <div className="demo-stack-list">
                <div className="demo-stack-item">
                  <strong style={{ display: 'block', marginBottom: 6, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--signature)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    biggest move
                  </strong>
                  {leadProject.analysis.prioritizedNextSteps[0]}
                </div>
                <div className="demo-stack-item">
                  <strong style={{ display: 'block', marginBottom: 6, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    top risk
                  </strong>
                  {leadProject.analysis.topRisks[0]}
                </div>
              </div>
            </div>

            <div className="glass-card demo-mosaic-card span-5">
              <SectionLabel>launch surface</SectionLabel>
              <h3>Marketing built from the dossier, not from vibes.</h3>
              <p>
                Recgon already knows what the product does, who it is for, and what makes it hard
                to copy. The marketing layer inherits that context instead of starting from zero.
              </p>
              <div className="demo-stack-list">
                <div className="demo-stack-item">{demoMarketing.instagram.caption}</div>
                <div className="demo-stack-item">{demoMarketing.tiktok.caption}</div>
                <div className="demo-stack-item">{demoCampaign.quickWins[0]}</div>
              </div>
            </div>

            <div className="glass-card demo-mosaic-card span-4">
              <SectionLabel>feedback cut</SectionLabel>
              <h3>What users are saying, compressed into work.</h3>
              <ul className="demo-plain-list">
                {demoFeedback.featureRequests.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="glass-card demo-mosaic-card span-4">
              <SectionLabel>developer prompt</SectionLabel>
              <h3>Feedback becomes an implementation brief.</h3>
              <p>{demoFeedback.developerPrompts[0]}</p>
            </div>

            <div className="glass-card demo-mosaic-card span-4">
              <SectionLabel>traffic truth</SectionLabel>
              <h3>Analytics with a point of view.</h3>
              <div className="demo-stack-list">
                <div className="demo-stack-item">{demoAnalytics.insights.topWin}</div>
                <div className="demo-stack-item">{demoAnalytics.insights.topConcern}</div>
              </div>
            </div>

            <div className="glass-card demo-mosaic-card span-6">
              <SectionLabel>multi-project memory</SectionLabel>
              <h3>Recgon does not flatten your workspace to one product.</h3>
              <p>
                TaskSurge and LoopBrief have different markets, pricing logic, risks, and launch
                strategies. The workspace keeps them distinct while still giving one founder-level
                pulse.
              </p>
              <div className="demo-split-grid">
                <div className="demo-subcard">
                  <SectionLabel>{leadProject.name}</SectionLabel>
                  <p>{leadProject.analysis.marketOpportunity}</p>
                </div>
                <div className="demo-subcard">
                  <SectionLabel>{secondProject.name}</SectionLabel>
                  <p>{secondProject.analysis.marketOpportunity}</p>
                </div>
              </div>
            </div>

            <div className="glass-card demo-mosaic-card span-6">
              <SectionLabel>metrics that matter</SectionLabel>
              <h3>Recgon tracks the business pressure, not vanity noise.</h3>
              <ul className="demo-kpi-list">
                {leadProject.analysis.growthMetrics.slice(0, 3).map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="demo-section">
          <div className="demo-section-grid">
            <div>
              <SectionLabel>inside the workspace</SectionLabel>
              <h2>The app itself is the proof.</h2>
            </div>
            <p>
              The strongest thing about Recgon is not a sentence on a page. It is the fact that the
              product already has a native place for the pulse, the terminal, the projects, the
              feedback, the analytics, and the launch work.
            </p>
          </div>

          <div className="demo-workspace-layout">
            <div className="demo-rail">
              {workspaceNotes.map((item, index) => (
                <RailItem
                  key={item.title}
                  title={item.title}
                  body={item.body}
                  index={String(index + 1).padStart(2, '0')}
                />
              ))}
            </div>

            <div className="glass-card" style={{ padding: 26 }}>
              <SectionLabel>why this does not feel generic</SectionLabel>
              <h3 style={{ fontSize: 32, lineHeight: 1, letterSpacing: '-0.05em', margin: '0 0 14px' }}>
                The copy, the visuals, and the product model are reading from the same object.
              </h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: 'var(--text-secondary)' }}>
                A generic AI landing page usually dies at the point where the features stop talking
                to each other. Recgon is interesting because its surfaces are chained: analysis
                informs marketing, feedback informs dev prompts, analytics informs strategy, and MCP
                lets an agent act on the result without dropping the context.
              </p>
            </div>
          </div>
        </section>

        <section id="agent-loop" className="demo-section">
          <div className="demo-agent-band">
            <div className="demo-agent-grid">
              <div>
                <SectionLabel>agent loop</SectionLabel>
                <h2>Recgon already knows how to brief the builder.</h2>
                <p>
                  The MCP layer is where this turns from a smart dashboard into an execution loop.
                  An agent can inspect the workspace, pull the full analysis, ask for the actionable
                  items, do the work, and write evidence back into Recgon.
                </p>
                <p>
                  That means the strategy record and the implementation trail stop drifting apart.
                </p>

                <div className="demo-agent-tools">
                  {agentTools.map((tool) => (
                    <div key={tool.name} className="demo-agent-tool">
                      <strong>{tool.name}</strong>
                      <p>{tool.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="demo-agent-terminal">
                <pre>{`$ recgon mcp connect
list_projects
-> ["TaskSurge", "LoopBrief"]

get_project_analysis("tasksurge")
-> audience, moat, pricing, risks, next steps

get_actionable_items("tasksurge")
-> recurring tasks
-> plan duplication bug

ship the work

mark_item_complete(...)
-> "Added recurring boolean, cron, and tests"

Result:
Recgon keeps the founder context,
the agent keeps moving,
and the history does not disappear.`}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="demo-close">
          <div className="glass-card demo-close-card">
            <SectionLabel>close</SectionLabel>
            <h2>This route is now much closer to the product&apos;s real temperature.</h2>
            <p>
              If this direction is closer, I can keep pushing: make the control room even more
              asymmetric, add motion between sections, or turn this into the new default landing
              once you decide it actually deserves that.
            </p>
            <div className="demo-close-actions">
              <a href="/landing-demo" className="btn btn-primary demo-link-btn">
                Reload demo
              </a>
              <Link href="/register" className="btn btn-secondary demo-link-btn">
                Continue to product
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

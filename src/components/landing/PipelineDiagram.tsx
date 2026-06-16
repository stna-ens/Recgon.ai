'use client';

import { BarChart3, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

function GithubIcon({ size = 14 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56C20.21 21.38 23.5 17.08 23.5 12A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function ownerInitials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export default function PipelineDiagram() {
  const t = useTranslations('landing.pipeline');

  const SOURCES = [
    { icon: GithubIcon, name: 'GitHub', meta: t('source.githubMeta') },
    { icon: BarChart3, name: 'GA4', meta: t('source.ga4Meta') },
    { icon: Users, name: t('source.team'), meta: t('source.teamMeta') },
  ];

  const ANALYSIS_LINES = [
    { label: t('analysis.swot'), status: t('analysis.swotStatus') },
    { label: t('analysis.risks'), status: t('analysis.risksStatus') },
    { label: t('analysis.levers'), status: t('analysis.leversStatus') },
    { label: t('analysis.nextSteps'), status: t('analysis.nextStepsStatus') },
    { label: t('analysis.dispatch'), status: t('analysis.dispatchStatus') },
  ];

  const TASKS = [
    { kind: 'next_step', kindLabel: t('tasks.kinds.nextStep'), title: t('tasks.task1Title'), owner: 'Maya', role: 'PM' },
    { kind: 'dev_prompt', kindLabel: t('tasks.kinds.devPrompt'), title: t('tasks.task2Title'), owner: 'Jin', role: 'Eng' },
    { kind: 'marketing', kindLabel: t('tasks.kinds.marketing'), title: t('tasks.task3Title'), owner: 'Sara', role: 'Growth' },
    { kind: 'analytics', kindLabel: t('tasks.kinds.analytics'), title: t('tasks.task4Title'), owner: 'Ola', role: 'Data' },
  ];

  return (
    <section id="pipeline" className="lnd-pipe">
      <div className="lnd-pipe-head">
        <span className="recgon-label">{t('label')}</span>
        <h2 className="lnd-pipe-title">{t('title')}</h2>
        <p className="lnd-pipe-sub">
          {t('subtitle')}
        </p>
      </div>

      <div className="lnd-pipe-grid">
        {/* Column 1: reading */}
        <article className="glass-card lnd-pipe-col" data-col="read">
          <header className="lnd-pipe-col-head">
            <span className="recgon-label">{t('reading')}</span>
            <span className="lnd-pipe-col-tag">{t('sources')}</span>
          </header>
          <ul className="lnd-pipe-list">
            {SOURCES.map(({ icon: Icon, name, meta }) => (
              <li key={name} className="lnd-pipe-source">
                <span className="lnd-pipe-source-icon"><Icon size={14} strokeWidth={2} /></span>
                <div className="lnd-pipe-source-text">
                  <span className="lnd-pipe-source-name">{name}</span>
                  <span className="lnd-pipe-source-meta">{meta}</span>
                </div>
                <span className="lnd-pipe-dot" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </article>

        {/* Arrow 1 */}
        <svg className="lnd-pipe-arrow" viewBox="0 0 80 20" aria-hidden="true">
          <line x1="2" y1="10" x2="74" y2="10" stroke="var(--signature)" strokeWidth="1.5" strokeDasharray="3 4" />
          <polyline points="68,4 76,10 68,16" fill="none" stroke="var(--signature)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Column 2: thinking */}
        <article className="glass-card lnd-pipe-col" data-col="think">
          <header className="lnd-pipe-col-head">
            <span className="recgon-label">{t('thinking')}</span>
            <span className="lnd-pipe-col-tag">{t('recgonBrain')}</span>
          </header>
          <ul className="lnd-pipe-analysis">
            {ANALYSIS_LINES.map(({ label, status }, i) => (
              <li key={label} className="lnd-pipe-analysis-line" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
                <span className="lnd-pipe-analysis-label">&gt; {label}</span>
                <span className="lnd-pipe-analysis-dotted" aria-hidden="true" />
                <span className="lnd-pipe-analysis-status">{status}</span>
              </li>
            ))}
          </ul>
          <footer className="lnd-pipe-think-foot">
            <span className="lnd-pipe-pulse" aria-hidden="true" />
            {t('ranking')}
          </footer>
        </article>

        {/* Arrow 2 */}
        <svg className="lnd-pipe-arrow" viewBox="0 0 80 20" aria-hidden="true">
          <line x1="2" y1="10" x2="74" y2="10" stroke="var(--signature)" strokeWidth="1.5" strokeDasharray="3 4" />
          <polyline points="68,4 76,10 68,16" fill="none" stroke="var(--signature)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Column 3: shipping */}
        <article className="glass-card lnd-pipe-col" data-col="ship">
          <header className="lnd-pipe-col-head">
            <span className="recgon-label">{t('shipping')}</span>
            <span className="lnd-pipe-col-tag">{t('assignedTasks')}</span>
          </header>
          <ul className="lnd-pipe-tasks">
            {TASKS.map(({ kind, kindLabel, title, owner, role }, i) => (
              <li key={title} className="lnd-pipe-task" style={{ animationDelay: `${0.7 + i * 0.1}s` }}>
                <span className="lnd-pipe-task-kind" data-kind={kind}>{kindLabel}</span>
                <span className="lnd-pipe-task-title">{title}</span>
                <span className="lnd-pipe-task-owner" title={`${owner} · ${role}`}>
                  <span className="lnd-pipe-task-avatar">{ownerInitials(owner)}</span>
                  <span className="lnd-pipe-task-owner-text">
                    <span className="lnd-pipe-task-owner-name">{owner}</span>
                    <span className="lnd-pipe-task-owner-role">{role}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <style>{`
        .lnd-pipe {
          position: relative;
          padding: 88px 24px 88px;
          max-width: 1240px;
          margin: 0 auto;
        }
        .lnd-pipe-head {
          text-align: center;
          max-width: 640px;
          margin: 0 auto 56px;
        }
        .lnd-pipe-title {
          margin: 0 0 14px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.15;
        }
        .lnd-pipe-sub {
          margin: 0;
          font-size: 15px;
          line-height: 1.55;
          color: var(--txt-muted);
        }

        .lnd-pipe-grid {
          display: grid;
          grid-template-columns: 1fr 80px 1fr 80px 1fr;
          gap: 0;
          align-items: stretch;
        }
        .lnd-pipe-col {
          padding: 24px !important;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 320px;
          opacity: 0;
          transform: translateY(12px);
          animation: lndPipeUp .55s var(--ease-out) forwards;
        }
        .lnd-pipe-col[data-col='read']  { animation-delay: 0.05s; }
        .lnd-pipe-col[data-col='think'] { animation-delay: 0.17s; }
        .lnd-pipe-col[data-col='ship']  { animation-delay: 0.29s; }
        @keyframes lndPipeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        .lnd-pipe-col-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .lnd-pipe-col-head .recgon-label { margin: 0; }
        .lnd-pipe-col-tag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 1.1px;
          text-transform: uppercase;
          color: var(--txt-faint);
          font-weight: 600;
        }

        /* Arrows */
        .lnd-pipe-arrow {
          width: 80px;
          height: 20px;
          align-self: center;
          opacity: 0;
          animation: lndArrowFade .35s var(--ease-out) forwards;
        }
        .lnd-pipe-grid > .lnd-pipe-arrow:nth-of-type(1) { animation-delay: 0.55s; }
        .lnd-pipe-grid > .lnd-pipe-arrow:nth-of-type(2) { animation-delay: 0.65s; }
        @keyframes lndArrowFade { to { opacity: 0.7; } }

        /* Sources list */
        .lnd-pipe-list, .lnd-pipe-tasks, .lnd-pipe-analysis {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .lnd-pipe-source {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(var(--signature-rgb), 0.04);
          border: 1px solid rgba(var(--signature-rgb), 0.08);
        }
        .lnd-pipe-source-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: rgba(var(--signature-rgb), 0.1);
          color: var(--signature);
          flex-shrink: 0;
        }
        .lnd-pipe-source-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
        .lnd-pipe-source-name {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          font-weight: 700;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
        }
        .lnd-pipe-source-meta {
          font-size: 11px;
          color: var(--txt-faint);
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lnd-pipe-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 6px var(--success);
          flex-shrink: 0;
          animation: lndPipeDot 2s ease-in-out infinite;
        }
        @keyframes lndPipeDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }

        /* Thinking column */
        .lnd-pipe-analysis-line {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          color: var(--txt-muted);
          opacity: 0;
          animation: lndAnalysisFade .35s var(--ease-out) forwards;
        }
        @keyframes lndAnalysisFade { to { opacity: 1; } }
        .lnd-pipe-analysis-label { color: var(--txt-pure); font-weight: 500; flex-shrink: 0; }
        .lnd-pipe-analysis-dotted {
          flex: 1;
          height: 1px;
          background-image: linear-gradient(90deg, var(--txt-faint) 50%, transparent 50%);
          background-size: 4px 1px;
          opacity: 0.4;
        }
        .lnd-pipe-analysis-status {
          color: var(--signature);
          font-weight: 600;
          flex-shrink: 0;
        }
        .lnd-pipe-think-foot {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(var(--signature-rgb), 0.1);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.3px;
          color: var(--txt-faint);
        }
        .lnd-pipe-pulse {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--signature);
          box-shadow: 0 0 8px var(--signature);
          animation: lndPipeDot 1.4s ease-in-out infinite;
        }

        /* Tasks column */
        .lnd-pipe-task {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(var(--signature-rgb), 0.04);
          border: 1px solid rgba(var(--signature-rgb), 0.08);
          opacity: 0;
          transform: translateY(2px);
          animation: lndTaskFade .35s var(--ease-out) forwards;
        }
        @keyframes lndTaskFade { to { opacity: 1; transform: translateY(0); } }
        .lnd-pipe-task-kind {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          padding: 3px 7px;
          border-radius: 4px;
          color: var(--signature);
          background: rgba(var(--signature-rgb), 0.1);
          border: 1px solid rgba(var(--signature-rgb), 0.2);
          white-space: nowrap;
        }
        .lnd-pipe-task-kind[data-kind='dev_prompt'] { color: var(--success); background: rgba(var(--success-rgb),0.1); border-color: rgba(var(--success-rgb),0.22); }
        .lnd-pipe-task-kind[data-kind='analytics'] { color: var(--warning); background: rgba(var(--warning-rgb),0.1); border-color: rgba(var(--warning-rgb),0.22); }
        .lnd-pipe-task-kind[data-kind='marketing'] { color: #0a7ea4; background: rgba(10,126,164,0.1); border-color: rgba(10,126,164,0.22); }
        .lnd-pipe-task-title {
          font-size: 12px;
          color: var(--txt-pure);
          font-weight: 500;
          letter-spacing: -0.005em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .lnd-pipe-task-owner {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .lnd-pipe-task-avatar {
          width: 22px; height: 22px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          color: var(--signature-ink);
          background: linear-gradient(135deg, var(--signature), rgba(var(--signature-rgb), 0.55));
          flex-shrink: 0;
        }
        .lnd-pipe-task-owner-text { display: flex; flex-direction: column; line-height: 1.05; }
        .lnd-pipe-task-owner-name { font-size: 11px; font-weight: 600; color: var(--txt-pure); }
        .lnd-pipe-task-owner-role {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        /* Mobile */
        @media (max-width: 920px) {
          .lnd-pipe-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .lnd-pipe-arrow {
            transform: rotate(90deg);
            justify-self: center;
            opacity: 0.7;
            animation: none;
          }
        }
        @media (max-width: 640px) {
          .lnd-pipe { padding: 56px 18px; }
          .lnd-pipe-col { min-height: 0; }
          .lnd-pipe-task { grid-template-columns: 1fr; gap: 6px; padding: 12px; }
          .lnd-pipe-task-owner { justify-content: flex-end; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lnd-pipe-col,
          .lnd-pipe-arrow,
          .lnd-pipe-analysis-line,
          .lnd-pipe-task,
          .lnd-pipe-dot,
          .lnd-pipe-pulse {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </section>
  );
}

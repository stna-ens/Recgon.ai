'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';

interface Step {
  key: 'project' | 'github' | 'team';
  href: string;
  done: boolean;
  primary?: boolean;
}

interface Props {
  hasProjects: boolean;
  hasGithub: boolean;
  teammateCount: number;
  /** Called when the user clicks "skip for now". Persists dismissal upstream. */
  onDismiss: () => void;
}

// FirstRunChecklist — the guided "what now" panel a fresh team sees at the
// top of the dashboard before they have any projects. Three concrete first
// steps, each a glass row with a done/pending marker. Steps mark themselves
// done from props so the panel reflects progress already made (e.g. a team
// invited before adding a project).
export default function FirstRunChecklist({ hasProjects, hasGithub, teammateCount, onDismiss }: Props) {
  const t = useTranslations('home');

  const steps: Step[] = [
    { key: 'project', href: '/projects', done: hasProjects, primary: true },
    { key: 'github', href: '/settings', done: hasGithub },
    { key: 'team', href: '/team', done: teammateCount > 0 },
  ];

  return (
    <section className="fr-shell glass-card is-static is-roomy" aria-label={t('firstRun.ariaLabel')}>
      <div className="fr-head">
        <span className="fr-eyebrow">{t('firstRun.eyebrow')}</span>
        <h2 className="fr-title">{t('firstRun.title')}</h2>
        <p className="fr-desc">{t('firstRun.description')}</p>
      </div>

      <ol className="fr-list">
        {steps.map((step, i) => (
          <li key={step.key} className="fr-step" data-done={step.done}>
            <span className="fr-marker" aria-hidden="true">{step.done ? '●' : '○'}</span>
            <span className="fr-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span className="fr-body">
              <span className="fr-label">{t(`firstRun.steps.${step.key}.label`)}</span>
              <span className="fr-step-desc">{t(`firstRun.steps.${step.key}.description`)}</span>
            </span>
            <span className="fr-action">
              {step.done ? (
                <span className="fr-done-tag">{t('firstRun.done')}</span>
              ) : (
                <Button asChild variant={step.primary ? 'primary' : 'secondary'} size="sm">
                  <Link href={step.href}>{t(`firstRun.steps.${step.key}.cta`)}</Link>
                </Button>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="fr-foot">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('firstRun.skip')}
        </Button>
      </div>

      <style>{css}</style>
    </section>
  );
}

const css = `
  .fr-shell {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4, 16px);
    padding: var(--card-pad, 20px);
    animation: frEnter var(--dur-base, 320ms) var(--ease-out, cubic-bezier(0.2, 0.8, 0.2, 1)) both;
  }
  @keyframes frEnter {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
  }
  .fr-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fr-eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--signature);
  }
  .fr-title {
    margin: 0;
    font-size: clamp(18px, 2vw, 22px);
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--txt-pure);
  }
  .fr-desc {
    margin: 0;
    max-width: 560px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--txt-muted);
  }

  .fr-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fr-step {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--rule);
    background: var(--glass-substrate, rgba(255, 255, 255, 0.02));
    transition: border-color var(--dur-fast, 160ms) var(--ease-out, ease), background var(--dur-fast, 160ms) var(--ease-out, ease);
  }
  .fr-step:hover {
    border-color: rgba(var(--signature-rgb), 0.3);
  }
  .fr-step[data-done='true'] {
    opacity: 0.62;
  }
  .fr-marker {
    font-size: 15px;
    line-height: 1;
    color: var(--txt-faint);
  }
  .fr-step[data-done='true'] .fr-marker {
    color: var(--signature);
  }
  .fr-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--txt-faint);
    font-variant-numeric: tabular-nums;
  }
  .fr-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fr-label {
    font-size: 13.5px;
    font-weight: 650;
    color: var(--txt-pure);
  }
  .fr-step-desc {
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--txt-muted);
  }
  .fr-action {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
  }
  .fr-done-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--signature);
    padding: 4px 9px;
    border-radius: 6px;
    background: rgba(var(--signature-rgb), 0.1);
    border: 1px solid rgba(var(--signature-rgb), 0.2);
  }
  .fr-foot {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 640px) {
    .fr-step {
      grid-template-columns: auto auto minmax(0, 1fr);
      row-gap: 10px;
    }
    .fr-action {
      grid-column: 3;
      justify-content: flex-start;
    }
  }
`;

'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Skeleton, EmptyState } from '@/components/ui';
import { cleanText, relTimeShort } from './utils';

// Background canvas effect — lazy-loaded so it doesn't sit on the critical
// dashboard render path. The component already self-pauses when off-screen
// or when the tab is hidden, but deferring the JS for it avoids paying for
// it during initial paint of the home view.
const LandingDotField = dynamic(
  () => import('@/components/landing/LandingDotField'),
  { ssr: false },
);

export interface FocusData {
  projectId: string;
  projectName: string;
  logoUrl?: string;
  currentStage: string | null;
  overallScore: number | null;
  topRisk: string | null;
  nextSteps: string[];
  analyzedAt: string | null;
  risksCount: number;
  nextStepsCount: number;
  improvementsCount: number;
}

interface Props {
  focus: FocusData | null;
  loading: boolean;
  now?: Date | null;
}

// Parse a "Term: explanation." format into title + body. Falls back to
// no title when the pattern doesn't match.
function parseStatement(text: string): { title: string; body: string } {
  const idx = text.indexOf(':');
  // Reject if the colon is too late (>60 chars) — that's not a title pattern.
  if (idx > 0 && idx < 60) {
    const title = text.slice(0, idx).trim();
    const body = text.slice(idx + 1).trim();
    if (title && body) return { title, body };
  }
  return { title: '', body: text };
}

// RiskCallout — the focus card's operator-terminal alert block. Two-tone
// (red for risk / green for bet), structured header line, title pulled
// from "X: Y" pattern, prose body, mono footer.
function RiskCallout({
  kind, tone, statement, everAnalyzed, analyzedAt, now,
}: {
  kind: 'risk' | 'bet';
  tone: 'crit' | 'mid' | 'good' | 'unknown';
  statement: string;
  everAnalyzed: boolean;
  analyzedAt: string | null;
  now: Date | null;
}) {
  const t = useTranslations('home');
  const { title, body } = parseStatement(statement);
  const sevLabel = kind === 'risk'
    ? (tone === 'crit' ? t('focus.severityCritical') : tone === 'mid' ? t('focus.severityWarning') : t('focus.severityInfo'))
    : t('focus.severityBet');
  const priorityLabel = kind === 'risk' ? t('focus.priorityTopRisk') : t('focus.priorityTopBet');

  return (
    <div className="v2-fc-callout" data-kind={kind} data-tone={tone}>
      <header className="v2-fc-callout-head">
        <span className="v2-fc-callout-sigil" aria-hidden="true">
          {kind === 'risk' ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 9v4M12 17h.01M5.5 19h13a2.5 2.5 0 0 0 2.18-3.74l-6.5-11.5a2.5 2.5 0 0 0-4.36 0l-6.5 11.5A2.5 2.5 0 0 0 5.5 19z" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          )}
        </span>
        <span className="v2-fc-callout-sev">{sevLabel}</span>
        <span className="v2-fc-callout-rule" aria-hidden="true" />
        <span className="v2-fc-callout-priority">{priorityLabel}</span>
      </header>

      {title && <h3 className="v2-fc-callout-title">{title}</h3>}
      <p className="v2-fc-callout-body">{body}</p>

      <footer className="v2-fc-callout-foot">
        <span className="v2-fc-callout-source">
          {everAnalyzed && analyzedAt
            ? t('focus.flaggedAgo', { time: relTimeShort(analyzedAt, now ?? Date.now()) })
            : kind === 'risk' ? t('focus.flaggedLatest') : t('focus.identifiedByRecgon')}
        </span>
      </footer>
    </div>
  );
}

// HomeFocus — cockpit hero. Recgon mostly returns analyses WITHOUT scores,
// so the design leads with qualitative signal (top risk / next step / stage)
// and treats the score as a bonus row only when present. Tone is derived
// from risk presence + analysis recency, not from score.
export default function HomeFocus({ focus, loading, now = null }: Props) {
  const t = useTranslations('home');
  if (loading) {
    return (
      <section className="v2-fc" aria-busy="true" aria-live="polite">
        <div className="v2-fc-shell v2-fc-skel">
          <Skeleton width={320} height={50} radius={8} />
          <Skeleton width="70%" height={14} radius={4} />
          <Skeleton width="50%" height={14} radius={4} />
        </div>
        <style>{stylesheet}</style>
      </section>
    );
  }

  if (!focus) {
    return (
      <section className="v2-fc">
        <div className="v2-fc-shell v2-fc-clear" data-tone="good">
          <div className="v2-fc-backplate" aria-hidden="true" />
          <div className="v2-fc-clear-content">
            <span className="v2-fc-status-chip" data-tone="good">
              <span className="v2-fc-status-chip-dot" />
              <span>{t('focus.allClear')}</span>
            </span>
            <h1 className="v2-fc-clear-title">{t('focus.clearTitle')}</h1>
            <p className="v2-fc-clear-text">
              {t('focus.clearText')}
            </p>
            <Link href="/projects" className="v2-fc-cta v2-fc-cta-secondary">
              {t('focus.browseProducts')}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
        <style>{stylesheet}</style>
      </section>
    );
  }

  const stage = focus.currentStage ?? null;
  const risk = cleanText(focus.topRisk);
  const nextStep = cleanText(focus.nextSteps[0]);
  const hash = focus.projectId.replace(/-/g, '').slice(0, 7);
  const everAnalyzed = !!focus.analyzedAt;

  // Tone is risk-driven (no scoring system in the app).
  // - If we have a top risk surfaced → 'crit' (something to address)
  // - If we only have a next step (a bet, no flagged risk) → 'good'
  // - If we have neither but it's been analyzed → 'mid' (analyzed, idle)
  // - If never analyzed → 'unknown'
  let tone: 'crit' | 'mid' | 'good' | 'unknown';
  if (!everAnalyzed) tone = 'unknown';
  else if (risk) tone = 'crit';
  else if (nextStep) tone = 'good';
  else tone = 'mid';

  const statusLabel =
    tone === 'crit' ? t('focus.statusAttentionRequired')
    : tone === 'mid' ? t('focus.statusOnWatch')
    : tone === 'good' ? t('focus.statusTrackingWell')
    : t('focus.statusAwaitingFirst');

  // The opinionated payload always shows a risk OR a bet. Lead with risk
  // when present (since that's what the user must address), otherwise
  // lead with the bet.
  const showRisk = !!risk;
  const showBet = !!nextStep;

  return (
    <section className="v2-fc">
      <div className="v2-fc-shell" data-tone={tone}>
        {/* Interactive dot field — each dot lifts and brightens with cursor
            proximity (canvas-rendered, real per-dot reaction). */}
        <div className="v2-fc-backplate" aria-hidden="true">
          <LandingDotField mode="parent" />
        </div>

        {/* TOP STRIP — status chip + project metadata line (this is where the dots show) */}
        <div className="v2-fc-strip">
          <span className="v2-fc-status-chip" data-tone={tone}>
            <span className="v2-fc-status-chip-dot" />
            <span>{statusLabel}</span>
          </span>
          <span className="v2-fc-strip-grow" />
          <span className="v2-fc-strip-meta">
            {focus.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={focus.logoUrl} alt="" className="v2-fc-strip-logo" />
            )}
            <span className="v2-fc-strip-name">{focus.projectName}</span>
            <span className="v2-fc-strip-sep">·</span>
            <span className="v2-fc-strip-hash" title={t('focus.projectIdTitle', { id: focus.projectId })}>{hash}</span>
          </span>
        </div>

        <div className="v2-fc-grid">

          {/* ── LEFT COLUMN — identity + payload + actions ── */}
          <div className="v2-fc-left">
            <div className="v2-fc-id">
              <span className="v2-fc-eyebrow">{t('focus.eyebrow')}</span>
              <h1 className="v2-fc-name">{focus.projectName}</h1>
            </div>

            {showRisk && (
              <RiskCallout
                kind="risk"
                tone={tone}
                statement={risk}
                everAnalyzed={everAnalyzed}
                analyzedAt={focus.analyzedAt}
                now={now}
              />
            )}

            {!showRisk && showBet && (
              <RiskCallout
                kind="bet"
                tone={tone}
                statement={nextStep}
                everAnalyzed={everAnalyzed}
                analyzedAt={focus.analyzedAt}
                now={now}
              />
            )}

            {/* If leading with risk, surface the bet as a secondary line */}
            {showRisk && showBet && (
              <div className="v2-fc-secondary">
                <span className="v2-fc-secondary-tag">{t('focus.yourMove')}</span>
                <span className="v2-fc-secondary-text">{nextStep}</span>
              </div>
            )}

            <div className="v2-fc-actions">
              <Link href={`/projects/${focus.projectId}`} className="v2-fc-cta v2-fc-cta-primary">
                {t('focus.openProject')}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link href={`/terminal?projectId=${focus.projectId}`} className="v2-fc-cta v2-fc-cta-secondary">
                {t('focus.askRecgon')}
              </Link>
            </div>
          </div>

          {/* ── RIGHT COLUMN — fills vertically with metadata + scope + voice ── */}
          <div className="v2-fc-right">
            {/* TOP — primary metadata */}
            <div className="v2-fc-right-top">
              <span className="v2-fc-right-tag">{t('focus.projectMeta')}</span>
              <div className="v2-fc-meta-grid">
                <div className="v2-fc-meta-cell">
                  <span className="v2-fc-meta-lab">{t('focus.stage')}</span>
                  <span className="v2-fc-meta-val">{stage ?? t('focus.dash')}</span>
                </div>
                <div className="v2-fc-meta-cell">
                  <span className="v2-fc-meta-lab">{t('focus.status')}</span>
                  <span className="v2-fc-meta-val v2-fc-meta-val-tone" data-tone={tone}>
                    {statusLabel}
                  </span>
                </div>
                <div className="v2-fc-meta-cell">
                  <span className="v2-fc-meta-lab">{t('focus.lastAnalyzed')}</span>
                  <span className="v2-fc-meta-val v2-fc-meta-val-mono">
                    {everAnalyzed ? t('focus.timeAgo', { time: relTimeShort(focus.analyzedAt, now ?? Date.now()) }) : t('focus.never')}
                  </span>
                </div>
                <div className="v2-fc-meta-cell">
                  <span className="v2-fc-meta-lab">{t('focus.projectId')}</span>
                  <span className="v2-fc-meta-val v2-fc-meta-val-mono" title={focus.projectId}>{hash}</span>
                </div>
              </div>
            </div>

            {/* MIDDLE — top moves. The risk callout already covers the
                  worst flag; here we surface the actual next-steps the
                  user should take. Counts of risks/wins are summarized
                  in the inline tag, not as oversized hero numbers. */}
            <div className="v2-fc-right-middle">
              <div className="v2-fc-right-tag-row">
                <span className="v2-fc-right-tag">{t('focus.yourMoves')}</span>
                <span className="v2-fc-right-tally">
                  <span className="v2-fc-right-tally-cell" data-tone="warn">
                    {focus.risksCount === 1 ? t('focus.flag', { count: focus.risksCount }) : t('focus.flags', { count: focus.risksCount })}
                  </span>
                  <span className="v2-fc-right-tally-cell" data-tone="good">
                    {focus.improvementsCount === 1 ? t('focus.win', { count: focus.improvementsCount }) : t('focus.wins', { count: focus.improvementsCount })}
                  </span>
                </span>
              </div>
              {focus.nextSteps.length === 0 ? (
                <EmptyState
                  compact
                  icon="◇"
                  title={t('focus.noMovesTitle')}
                  description={t('focus.noNextSteps')}
                />
              ) : (
                <ol className="v2-fc-moves">
                  {focus.nextSteps.slice(0, 3).map((step, i) => (
                    <li key={i} className="v2-fc-move">
                      <span className="v2-fc-move-num" aria-hidden="true">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="v2-fc-move-text">{cleanText(step)}</span>
                    </li>
                  ))}
                </ol>
              )}

            </div>

          </div>

        </div>
      </div>
      <style>{stylesheet}</style>
    </section>
  );
}

const stylesheet = `
  .v2-fc { display: block; }

  /* SHELL */
  .v2-fc-shell {
    position: relative;
    overflow: hidden;
    border-radius: 14px;
    padding: 20px 24px;
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(var(--signature-rgb), 0.4) 0%,
        rgba(var(--signature-rgb), 0.06) 35%,
        rgba(var(--signature-rgb), 0.05) 65%,
        rgba(var(--signature-rgb), 0.25) 100%) border-box;
    border: 1px solid transparent;
    backdrop-filter: blur(40px) saturate(160%);
    -webkit-backdrop-filter: blur(40px) saturate(160%);
    box-shadow:
      0 22px 50px -22px rgba(0, 0, 0, 0.45),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  html.light .v2-fc-shell,
  .light .v2-fc-shell {
    box-shadow:
      0 18px 40px -18px rgba(0, 0, 0, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }
  .v2-fc-shell[data-tone='crit'] {
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(220, 38, 38, 0.45) 0%,
        rgba(var(--signature-rgb), 0.06) 35%,
        rgba(var(--signature-rgb), 0.05) 65%,
        rgba(220, 38, 38, 0.22) 100%) border-box;
  }
  .v2-fc-shell[data-tone='good'] {
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(16, 185, 129, 0.4) 0%,
        rgba(var(--signature-rgb), 0.06) 35%,
        rgba(var(--signature-rgb), 0.05) 65%,
        rgba(16, 185, 129, 0.2) 100%) border-box;
  }
  .v2-fc-shell[data-tone='mid'] {
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(217, 119, 6, 0.4) 0%,
        rgba(var(--signature-rgb), 0.06) 35%,
        rgba(var(--signature-rgb), 0.05) 65%,
        rgba(217, 119, 6, 0.2) 100%) border-box;
  }

  /* DOTTED BACKPLATE — canvas-rendered. Each dot reacts to the cursor
     individually: brightens, scales up, and is magnetically pulled
     toward the pointer. Pointer events fire on .v2-fc-shell. */
  .v2-fc-backplate {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .v2-fc-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .v2-fc-shell > *:not(.v2-fc-backplate) {
    position: relative;
    z-index: 1;
  }

  /* TOP STRIP */
  .v2-fc-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .v2-fc-strip-grow { flex: 1; min-width: 16px; }
  .v2-fc-strip-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--txt-faint);
    letter-spacing: 0.2px;
    font-weight: 500;
  }
  .v2-fc-strip-logo {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .v2-fc-strip-name { color: var(--txt-pure); font-weight: 600; }
  .v2-fc-strip-stage { color: var(--txt-muted); text-transform: lowercase; }
  .v2-fc-strip-sep { opacity: 0.45; }
  .v2-fc-strip-hash {
    color: var(--txt-faint);
    padding: 2px 6px;
    background: rgba(var(--signature-rgb), 0.05);
    border: 1px solid var(--rule);
    border-radius: 4px;
    font-size: 10px;
    letter-spacing: 0.3px;
  }

  /* STATUS CHIP */
  .v2-fc-status-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .v2-fc-status-chip[data-tone='crit'] {
    color: var(--danger, #dc2626);
    background: rgba(220, 38, 38, 0.12);
    border: 1px solid rgba(220, 38, 38, 0.32);
  }
  .v2-fc-status-chip[data-tone='mid'] {
    color: var(--warning, #d97706);
    background: rgba(217, 119, 6, 0.12);
    border: 1px solid rgba(217, 119, 6, 0.32);
  }
  .v2-fc-status-chip[data-tone='good'] {
    color: var(--success, #059669);
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.32);
  }
  .v2-fc-status-chip[data-tone='unknown'] {
    color: var(--txt-muted);
    background: rgba(var(--signature-rgb), 0.05);
    border: 1px solid var(--rule);
  }
  .v2-fc-status-chip-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 7px currentColor;
    animation: v2fcChipDot 2s ease-in-out infinite;
  }
  @keyframes v2fcChipDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(1.25); }
  }

  /* MAIN GRID */
  .v2-fc-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
    gap: 32px;
    align-items: stretch;
  }
  @media (max-width: 980px) {
    .v2-fc-grid { grid-template-columns: 1fr; gap: 24px; }
  }

  .v2-fc-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  /* RIGHT METADATA COLUMN — opaque inset card-within-a-card that fills the
     hero's height. Three vertical zones: meta grid / scope stats / voice. */
  .v2-fc-right {
    display: flex;
    flex-direction: column;
    padding: 18px 20px;
    border-radius: 10px;
    background: var(--bg-deep);
    border: 1px solid rgba(var(--signature-rgb), 0.12);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    align-self: stretch;
    min-height: 100%;
  }
  html.light .v2-fc-right,
  .light .v2-fc-right {
    background: #ffffff;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }
  .v2-fc-right-top {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .v2-fc-right-middle {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 0;
    margin: 16px 0;
    border-top: 1px solid rgba(var(--signature-rgb), 0.08);
    border-bottom: 1px solid rgba(var(--signature-rgb), 0.08);
    flex: 1;
    justify-content: center;
  }
  .v2-fc-right-bottom {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto;
  }
  .v2-fc-right-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
    opacity: 0.75;
  }

  /* TAG + TALLY ROW — section label on left, tiny count chips on right */
  .v2-fc-right-tag-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .v2-fc-right-tally {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .v2-fc-right-tally-cell { color: var(--txt-faint); }
  .v2-fc-right-tally-cell[data-tone='warn'] { color: var(--warning, #d97706); }
  .v2-fc-right-tally-cell[data-tone='good'] { color: var(--success, #059669); }
  .v2-fc-right-tally-cell + .v2-fc-right-tally-cell::before {
    content: '·';
    margin-right: 8px;
    opacity: 0.45;
    color: var(--txt-faint);
  }

  /* TOP MOVES — numbered terminal-style list of next steps */
  .v2-fc-moves {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .v2-fc-move {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(var(--signature-rgb), 0.03);
    border: 1px solid rgba(var(--signature-rgb), 0.06);
    transition: background var(--dur-base) ease, border-color var(--dur-base) ease;
  }
  .v2-fc-move:hover {
    background: rgba(var(--signature-rgb), 0.06);
    border-color: rgba(var(--signature-rgb), 0.18);
  }
  .v2-fc-move-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 700;
    color: var(--signature);
    letter-spacing: 0.4px;
    flex-shrink: 0;
    margin-top: 1px;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }
  .v2-fc-move-text {
    font-size: 12px;
    line-height: 1.45;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
    font-weight: 500;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  /* HEALTH ROW (within middle) */
  .v2-fc-health-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .v2-fc-health-row-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .v2-fc-voice-empty {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--txt-faint);
    opacity: 0.7;
  }

  /* IDENTITY */
  .v2-fc-id { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .v2-fc-eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--signature);
    font-weight: 700;
    opacity: 0.85;
  }
  .v2-fc-name {
    margin: 0;
    font-size: clamp(36px, 5vw, 56px);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1;
    color: var(--txt-pure);
  }

  /* CALLOUT — operator-terminal alert. Solid bg-deep surface, top accent
     bar, structured header (sigil + severity + rule + priority tag),
     pulled-out title, prose body, mono footer with source line. */
  .v2-fc-callout {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px 14px;
    border-radius: 10px;
    background: var(--bg-deep);
    border: 1px solid rgba(220, 38, 38, 0.22);
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }
  .v2-fc-callout::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      var(--danger, #dc2626) 0%,
      rgba(220, 38, 38, 0.4) 50%,
      transparent 100%);
  }
  .v2-fc-callout::after {
    /* Subtle dotted texture in bottom-right corner — atmospheric depth */
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(
      circle,
      rgba(220, 38, 38, 0.08) 1px,
      transparent 1px
    );
    background-size: 12px 12px;
    background-position: 6px 6px;
    mask-image: radial-gradient(ellipse at 100% 100%, black 0%, transparent 55%);
    -webkit-mask-image: radial-gradient(ellipse at 100% 100%, black 0%, transparent 55%);
    opacity: 0.6;
  }

  /* tone variants */
  .v2-fc-callout[data-tone='mid'] { border-color: rgba(217, 119, 6, 0.22); }
  .v2-fc-callout[data-tone='mid']::before {
    background: linear-gradient(90deg, var(--warning, #d97706) 0%, rgba(217, 119, 6, 0.4) 50%, transparent 100%);
  }
  .v2-fc-callout[data-tone='mid']::after {
    background-image: radial-gradient(circle, rgba(217, 119, 6, 0.08) 1px, transparent 1px);
  }
  .v2-fc-callout[data-tone='good'],
  .v2-fc-callout[data-kind='bet'] { border-color: rgba(16, 185, 129, 0.22); }
  .v2-fc-callout[data-tone='good']::before,
  .v2-fc-callout[data-kind='bet']::before {
    background: linear-gradient(90deg, var(--success, #059669) 0%, rgba(16, 185, 129, 0.4) 50%, transparent 100%);
  }
  .v2-fc-callout[data-tone='good']::after,
  .v2-fc-callout[data-kind='bet']::after {
    background-image: radial-gradient(circle, rgba(16, 185, 129, 0.08) 1px, transparent 1px);
  }
  .v2-fc-callout[data-tone='unknown'] { border-color: var(--rule); }
  .v2-fc-callout[data-tone='unknown']::before {
    background: linear-gradient(90deg, var(--txt-faint) 0%, transparent 60%);
  }

  .v2-fc-callout > * { position: relative; z-index: 1; }

  /* Header row */
  .v2-fc-callout-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 2px;
  }
  .v2-fc-callout-sigil {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px; height: 18px;
    border-radius: 4px;
    background: rgba(220, 38, 38, 0.12);
    color: var(--danger, #dc2626);
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.25);
  }
  .v2-fc-callout[data-tone='mid'] .v2-fc-callout-sigil {
    background: rgba(217, 119, 6, 0.12);
    color: var(--warning, #d97706);
    box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.25);
  }
  .v2-fc-callout[data-tone='good'] .v2-fc-callout-sigil,
  .v2-fc-callout[data-kind='bet'] .v2-fc-callout-sigil {
    background: rgba(16, 185, 129, 0.12);
    color: var(--success, #059669);
    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.25);
  }
  .v2-fc-callout[data-tone='unknown'] .v2-fc-callout-sigil {
    background: rgba(var(--signature-rgb), 0.08);
    color: var(--txt-muted);
    box-shadow: 0 0 0 1px var(--rule);
  }

  .v2-fc-callout-sev {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--danger, #dc2626);
  }
  .v2-fc-callout[data-tone='mid'] .v2-fc-callout-sev { color: var(--warning, #d97706); }
  .v2-fc-callout[data-tone='good'] .v2-fc-callout-sev,
  .v2-fc-callout[data-kind='bet'] .v2-fc-callout-sev { color: var(--success, #059669); }
  .v2-fc-callout[data-tone='unknown'] .v2-fc-callout-sev { color: var(--txt-muted); }

  .v2-fc-callout-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg,
      rgba(var(--signature-rgb), 0.15) 0%,
      rgba(var(--signature-rgb), 0.05) 100%);
  }

  .v2-fc-callout-priority {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 600;
  }

  /* Title — pulled from "X: Y" pattern */
  .v2-fc-callout-title {
    margin: 0;
    font-size: clamp(17px, 1.7vw, 20px);
    font-weight: 600;
    letter-spacing: -0.022em;
    line-height: 1.2;
    color: var(--txt-pure);
  }

  /* Body prose */
  .v2-fc-callout-body {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--txt-muted);
    letter-spacing: -0.003em;
  }

  /* Footer */
  .v2-fc-callout-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid rgba(var(--signature-rgb), 0.06);
  }
  .v2-fc-callout-source {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-faint);
    letter-spacing: 0.2px;
    font-weight: 500;
    opacity: 0.85;
  }

  /* SECONDARY MOVE */
  .v2-fc-secondary {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 0 4px;
  }
  .v2-fc-secondary-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    color: var(--signature);
    font-weight: 700;
    flex-shrink: 0;
  }
  .v2-fc-secondary-text {
    font-size: 12.5px;
    color: var(--txt-muted);
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* ACTIONS */
  .v2-fc-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 4px;
  }
  .v2-fc-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: -0.005em;
    text-decoration: none;
    transition: transform var(--dur-base) cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow var(--dur-base) ease, background var(--dur-base) ease, border-color var(--dur-base) ease;
  }
  .v2-fc-cta-primary {
    background: var(--signature);
    color: white;
    box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.5), 0 6px 18px -8px rgba(var(--signature-rgb), 0.6);
  }
  .v2-fc-cta-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.6), 0 14px 32px -10px rgba(var(--signature-rgb), 0.7);
  }
  .v2-fc-cta-primary svg { transition: transform 180ms ease; }
  .v2-fc-cta-primary:hover svg { transform: translateX(3px); }
  .v2-fc-cta-secondary {
    color: var(--txt-pure);
    border: 1px solid var(--rule);
    background: rgba(var(--signature-rgb), 0.025);
  }
  .v2-fc-cta-secondary:hover {
    border-color: rgba(var(--signature-rgb), 0.45);
    background: rgba(var(--signature-rgb), 0.06);
  }

  /* ── RIGHT METADATA ── */
  .v2-fc-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px 18px;
  }
  .v2-fc-meta-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .v2-fc-meta-lab {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-fc-meta-val {
    font-size: 13px;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
    font-weight: 500;
    text-transform: capitalize;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v2-fc-meta-val-mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    text-transform: none;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  .v2-fc-meta-val-tone[data-tone='crit'] { color: var(--danger, #dc2626); }
  .v2-fc-meta-val-tone[data-tone='mid']  { color: var(--warning, #d97706); }
  .v2-fc-meta-val-tone[data-tone='good'] { color: var(--success, #059669); }
  .v2-fc-meta-val-tone[data-tone='unknown'] { color: var(--txt-muted); }

  .v2-fc-meta-divider {
    height: 1px;
    background: rgba(var(--signature-rgb), 0.08);
  }

  /* HEALTH block — only when scored */
  .v2-fc-health {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .v2-fc-meta-score {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
  .v2-fc-meta-score-num {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .v2-fc-meta-score-denom {
    font-size: 14px;
    color: var(--txt-faint);
    letter-spacing: -0.005em;
  }
  .v2-fc-meta-score[data-tone='crit'] .v2-fc-meta-score-num { color: var(--danger, #dc2626); }
  .v2-fc-meta-score[data-tone='mid']  .v2-fc-meta-score-num { color: var(--warning, #d97706); }
  .v2-fc-meta-score[data-tone='good'] .v2-fc-meta-score-num { color: var(--success, #059669); }

  .v2-fc-meta-bar-track {
    height: 5px;
    background: rgba(var(--signature-rgb), 0.08);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
    border: 1px solid rgba(var(--signature-rgb), 0.06);
  }
  .v2-fc-meta-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 800ms cubic-bezier(0.2, 0.8, 0.2, 1);
    background: var(--txt-faint);
  }
  .v2-fc-meta-bar-fill[data-tone='crit'] {
    background: linear-gradient(90deg, var(--danger, #dc2626), rgba(220, 38, 38, 0.8));
    box-shadow: 0 0 6px rgba(220, 38, 38, 0.4);
  }
  .v2-fc-meta-bar-fill[data-tone='mid'] {
    background: linear-gradient(90deg, var(--warning, #d97706), rgba(217, 119, 6, 0.8));
    box-shadow: 0 0 6px rgba(217, 119, 6, 0.4);
  }
  .v2-fc-meta-bar-fill[data-tone='good'] {
    background: linear-gradient(90deg, var(--success, #059669), rgba(16, 185, 129, 0.8));
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
  }
  .v2-fc-meta-bar-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(var(--signature-rgb), 0.18);
  }

  /* VOICE */
  .v2-fc-voice {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .v2-fc-voice-text {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--txt-muted);
    font-style: italic;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  /* ALL-CLEAR */
  .v2-fc-clear { padding: 28px 24px !important; }
  .v2-fc-clear-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    max-width: 540px;
  }
  .v2-fc-clear-title {
    margin: 0;
    font-size: clamp(22px, 2.4vw, 28px);
    font-weight: 600;
    letter-spacing: -0.018em;
    color: var(--txt-pure);
    line-height: 1.2;
  }
  .v2-fc-clear-text {
    margin: 0;
    font-size: 14px;
    color: var(--txt-muted);
    line-height: 1.55;
  }

  /* SKELETON — shimmer comes from the shared .ui-skeleton primitive; this
     only owns the shell padding + min-height to avoid layout shift. */
  .v2-fc-skel {
    padding: 24px 28px !important;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
`;

'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTeam } from '@/components/TeamProvider';
import { Button } from '@/components/ui';
import { shouldShowFirstRun, isFirstRunDismissed, dismissFirstRun } from '@/lib/firstRun';
import FirstRunChecklist from '@/components/v2/FirstRunChecklist';
import HomeFocus, { type FocusData } from '@/components/v2/HomeFocus';
import HomeBoard, {
  type BoardDecisions,
  type BoardUpdate,
  type BoardTeamPulse,
} from '@/components/v2/HomeBoard';
import HomePortfolio, { type PortfolioRow } from '@/components/v2/HomePortfolio';
import SectionIndex from '@/components/v2/SectionIndex';
import { cleanText, projectInitial, pulseShort } from '@/components/v2/utils';

interface OverviewPayload {
  totalProjects: number;
  todayFocus: FocusData | null;
  decisionDeck: BoardDecisions;
  updates: BoardUpdate[];
  projectCards: PortfolioRow[];
  teamPulse: BoardTeamPulse | null;
}

const EMPTY_DECISIONS: BoardDecisions = {
  stuck: [], stuckTotal: 0,
  failed: [], failedTotal: 0,
  drift: [], driftTotal: 0,
};

const EMPTY_OVERVIEW: OverviewPayload = {
  totalProjects: 0,
  todayFocus: null,
  decisionDeck: EMPTY_DECISIONS,
  updates: [],
  projectCards: [],
  teamPulse: null,
};

const HOME_DEFAULT_VARIANT: 'refined' | 'classic' = 'classic';

function totalDecisions(decisions: BoardDecisions): number {
  return decisions.failedTotal + decisions.stuckTotal + decisions.driftTotal;
}


// V2 Home — the operator's cockpit.
//
// Three sections answering three questions, in priority order:
//   1. HomeFocus     — what's my single most important product right now?
//   2. HomeBoard     — what's waiting on me / what shipped / what's at risk?
//   3. HomePortfolio — what's the full picture across products?
//
// Deliberately CUT from the previous design: workspace identity card,
// status tile grid, AI workforce capacity widget, total-events headline,
// per-category mini-chart grid, "deployment hash" chips, decorative pseudo-
// metrics. None of those answer a real PM question. Throughput is not an
// outcome.
function V2HomeInner() {
  const t = useTranslations('home');
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const searchParams = useSearchParams();

  // Two parallel cached fetches — overview is the slow one (LLM-dependent paths
  // around updates/wins), team-pulse is fast (pure SQL aggregates). SWR keeps
  // each keyed by teamId, so returning to this tab paints the last-known data
  // instantly and revalidates silently in the background. The skeleton shows
  // only on the genuine first load (no cached data yet).
  const { data: overviewData } = useSWR<OverviewPayload | null>(
    teamId ? `/api/overview?teamId=${teamId}` : null,
  );
  const { data: pulseData } = useSWR<BoardTeamPulse | null>(
    teamId ? `/api/overview/team-pulse?teamId=${teamId}` : null,
  );

  const loading = teamId != null && overviewData === undefined;

  const overview: OverviewPayload = useMemo(() => {
    if (!overviewData) return EMPTY_OVERVIEW;
    return {
      totalProjects: overviewData.totalProjects ?? 0,
      todayFocus: overviewData.todayFocus ?? null,
      decisionDeck: overviewData.decisionDeck ?? EMPTY_DECISIONS,
      updates: Array.isArray(overviewData.updates) ? overviewData.updates : [],
      projectCards: Array.isArray(overviewData.projectCards) ? overviewData.projectCards : [],
      teamPulse: pulseData ?? null,
    };
  }, [overviewData, pulseData]);

  const showEmpty = !loading && overview.totalProjects === 0;

  // First-run guided checklist. Dismissal is per-team and persisted in
  // localStorage; we read it once data resolves so the panel never flashes.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(teamId ? isFirstRunDismissed(teamId) : false);
  }, [teamId]);

  const handleDismissFirstRun = useCallback(() => {
    if (teamId) dismissFirstRun(teamId);
    setDismissed(true);
  }, [teamId]);

  // GitHub signal is derived cheaply: any commit update means a repo is
  // connected. No extra fetch. teammateCount comes from the team-pulse SWR.
  const hasGithub = overview.updates.length > 0;
  const teammateCount = pulseData?.totalMembers ?? 0;
  const showFirstRun =
    !loading &&
    shouldShowFirstRun({ projectCount: overview.totalProjects, dismissed });

  const homeParam = searchParams.get('home');
  const variant =
    homeParam === 'refined' ? 'refined'
    : homeParam === 'classic' ? 'classic'
    : HOME_DEFAULT_VARIANT;

  return (
    <div className="v2-cockpit" data-home-variant={variant}>
      {showFirstRun ? (
        <FirstRunChecklist
          hasProjects={overview.totalProjects > 0}
          hasGithub={hasGithub}
          teammateCount={teammateCount}
          onDismiss={handleDismissFirstRun}
        />
      ) : showEmpty ? (
        <div className="glass-card is-static is-roomy v2-empty-hero">
          <div className="v2-empty-num" aria-hidden="true">01</div>
          <div className="v2-empty-body">
            <h2 className="v2-empty-title">
              <span className="v2-pink">{t('emptyHero.titlePink')}</span>{t('emptyHero.titleRest')}
            </h2>
            <p className="v2-empty-text">
              {t('emptyHero.text')}
            </p>
            <Link href="/projects" className="v2-empty-cta">
              <span>{t('emptyHero.cta')}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      ) : variant === 'classic' ? (
        <ClassicHome overview={overview} loading={loading} />
      ) : (
        <RefinedHome overview={overview} loading={loading} />
      )}

      <style>{`
        .v2-cockpit {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 1440px;
          margin: 0 auto;
          animation: v2cockpitFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2cockpitFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .v2-cockpit > * {
          animation: v2sectionFade 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .v2-cockpit > *:nth-child(1) { animation-delay: 30ms; }
        .v2-cockpit > *:nth-child(2) { animation-delay: 80ms; }
        .v2-cockpit > *:nth-child(3) { animation-delay: 180ms; }
        .v2-cockpit > *:nth-child(4) { animation-delay: 240ms; }
        .v2-cockpit > *:nth-child(5) { animation-delay: 340ms; }
        .v2-cockpit > *:nth-child(6) { animation-delay: 400ms; }
        @keyframes v2sectionFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }

        /* Spacing rhythm: the SectionIndex sits TIGHT to its section
           (gap 14px above), but each (index + section) PAIR has more
           breathing room from the previous pair. Achieved with a top
           margin on every section-index AFTER the first. */
        .v2-cockpit > .v2-sec-idx { margin-top: 16px; }
        .v2-cockpit > .v2-sec-idx:first-child { margin-top: 0; }

        /* Section index marker — number + label tight together, sub off
           to the side. No decorative rule between them. */
        .v2-sec-idx {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 3px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .v2-sec-idx-num {
          font-size: 11px;
          letter-spacing: 0.6px;
          color: var(--signature);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          padding: 2px 7px;
          background: rgba(var(--signature-rgb), 0.08);
          border: 1px solid rgba(var(--signature-rgb), 0.2);
          border-radius: 4px;
        }
        .v2-sec-idx-lab {
          font-size: 11px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--txt-pure);
          font-weight: 700;
        }

        .v2-cockpit[data-home-variant='classic'] .v2-sec-idx {
          min-height: 26px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-sec-idx-num {
          border-radius: 6px;
          background: rgba(var(--signature-rgb), 0.11);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.06);
        }
        .v2-cockpit[data-home-variant='classic'] .v2-sec-idx-lab {
          letter-spacing: 1px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-sec-idx-sub {
          letter-spacing: 0;
          color: var(--txt-muted);
        }

        /* Classic homepage polish: keep the same content, improve density,
           rhythm, and visible actions. */
        .v2-cockpit[data-home-variant='classic'] .v2-fc-shell {
          border-radius: 12px;
          padding: 18px 22px;
          gap: 14px;
          box-shadow:
            0 18px 42px -24px rgba(0, 0, 0, 0.48),
            inset 0 1px 0 rgba(255, 255, 255, 0.055);
        }
        .v2-cockpit[data-home-variant='classic'] .v2-fc-grid {
          gap: 24px;
          grid-template-columns: minmax(0, 1.42fr) minmax(300px, 0.88fr);
        }
        .v2-cockpit[data-home-variant='classic'] .v2-fc-name {
          letter-spacing: 0;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-fc-callout {
          border-radius: 10px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-fc-right {
          border-radius: 10px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-fc-cta {
          border-radius: 8px;
        }

        .v2-cockpit[data-home-variant='classic'] .v2-bd-grid {
          gap: 12px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-bd-col.glass-card {
          border-radius: 10px;
          min-height: 244px;
          padding: 18px 18px 48px;
          gap: 13px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-bd-col-head {
          gap: 10px;
          padding-bottom: 11px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-bd-col-tag {
          letter-spacing: 0.6px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-bd-counter-num {
          font-size: 33px;
          letter-spacing: 0;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-bd-counter-lab {
          letter-spacing: 0;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-bd-dec {
          border-radius: 8px;
          padding: 10px 12px 10px 14px;
          background: rgba(255,255,255,0.026);
        }
        .v2-cockpit[data-home-variant='classic'] .v2-pf {
          gap: 12px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-pf-card {
          border-radius: 10px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-pf-statusbar {
          gap: 5px;
        }
        .v2-cockpit[data-home-variant='classic'] .v2-pf-rowlink {
          min-height: 56px;
        }
        @media (max-width: 980px) {
          .v2-cockpit[data-home-variant='classic'] .v2-fc-grid {
            grid-template-columns: 1fr;
          }
        }
        .v2-sec-idx-sub {
          margin-left: 6px;
          font-size: 10px;
          letter-spacing: 0.3px;
          color: var(--txt-faint);
          font-weight: 500;
          text-transform: lowercase;
        }
        .v2-sec-idx-sub::before {
          content: '·';
          margin-right: 8px;
          opacity: 0.5;
        }
        @media (max-width: 720px) {
          .v2-sec-idx-sub { display: none; }
        }

        .v2-pink { color: var(--signature); }

        .v2-home-mode {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-height: 24px;
        }
        .v2-home-pf-all {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 8px 13px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 650;
          text-decoration: none;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, color 180ms ease;
          color: var(--txt-faint);
          background: transparent;
          border: 1px solid var(--rule);
        }
        .v2-home-pf-all:hover {
          transform: translateY(-1px);
          color: var(--txt-pure);
          border-color: rgba(var(--signature-rgb), 0.34);
        }

        .v2-home-pf {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .v2-home-pf-head {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .v2-home-pf-grow { flex: 1; }
        .v2-home-pf-card {
          padding: 6px;
          border-radius: 10px;
        }
        .v2-home-pf-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        .v2-home-pf-row + .v2-home-pf-row {
          border-top: 1px solid var(--rule);
        }
        .v2-home-pf-link {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          min-height: 58px;
          padding: 8px 10px;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          transition: background var(--dur-fast) ease;
        }
        .v2-home-pf-link:hover {
          background: rgba(255,255,255,0.035);
        }
        .v2-home-pf-avatar {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(var(--signature-rgb), 0.18);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
          color: var(--txt-pure);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          font-weight: 800;
        }
        .v2-home-pf-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .v2-home-pf-name {
          color: var(--txt-pure);
          font-size: 13px;
          font-weight: 650;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-home-pf-risk {
          color: var(--txt-muted);
          font-size: 12px;
          line-height: 1.35;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
        }
        .v2-home-pf-meta {
          display: flex;
          align-items: flex-end;
          flex-direction: column;
          gap: 3px;
          min-width: 72px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          color: var(--txt-faint);
          font-size: 10px;
          text-transform: lowercase;
        }
        .v2-home-pf-meta strong {
          color: var(--txt-pure);
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }
        .v2-home-pf-row[data-pulse='stuck'] .v2-home-pf-meta strong,
        .v2-home-pf-row[data-pulse='drifting'] .v2-home-pf-meta strong {
          color: var(--danger);
        }
        .v2-home-pf-row[data-pulse='shipping'] .v2-home-pf-meta strong {
          color: var(--success);
        }
        .v2-home-pf-empty {
          margin: 0;
          padding: 18px;
          color: var(--txt-muted);
          font-size: 13px;
        }
        .v2-home-pf-skel {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px;
        }
        .v2-home-pf-skel span {
          height: 42px;
          border-radius: 8px;
          background: rgba(255,255,255,0.045);
          animation: v2sectionFade 900ms ease-in-out infinite alternate;
        }

        /* --- EMPTY HERO --- */
        .v2-empty-hero {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 36px;
          align-items: center;
        }
        .v2-empty-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 96px;
          font-weight: 200;
          line-height: 1;
          color: var(--signature);
          letter-spacing: -0.05em;
          font-variant-numeric: tabular-nums;
          opacity: 0.92;
        }
        .v2-empty-title {
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.018em;
          color: var(--txt-pure);
          margin: 0 0 14px;
        }
        .v2-empty-text {
          max-width: 520px;
          font-size: 14px;
          line-height: 1.65;
          color: var(--txt-muted);
          margin: 0 0 22px;
        }
        .v2-empty-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 11px 18px;
          background: var(--signature);
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.005em;
          text-decoration: none;
          transition: transform var(--dur-base) cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow var(--dur-base) ease;
        }
        .v2-empty-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -8px rgba(var(--signature-rgb), 0.45);
        }
        .v2-empty-cta svg { transition: transform var(--dur-base) ease; }
        .v2-empty-cta:hover svg { transform: translateX(3px); }

        @media (max-width: 720px) {
          .v2-home-mode { justify-content: flex-start; }
          .v2-home-pf-link {
            grid-template-columns: auto minmax(0, 1fr);
          }
          .v2-home-pf-meta {
            grid-column: 2;
            align-items: flex-start;
            flex-direction: row;
          }
          .v2-empty-hero { grid-template-columns: 1fr; gap: 18px; }
          .v2-empty-num { font-size: 56px; }
        }
      `}</style>
    </div>
  );
}

function ClassicHome({ overview, loading }: { overview: OverviewPayload; loading: boolean }) {
  const t = useTranslations('home');
  return (
    <>
      <SectionIndex idx="01" label={t('sections.focus')} sub={t('sections.focusSub')} />
      <HomeFocus
        focus={overview.todayFocus}
        loading={loading}
      />

      <SectionIndex idx="02" label={t('sections.board')} />
      <HomeBoard
        decisions={overview.decisionDeck}
        updates={overview.updates}
        teamPulse={overview.teamPulse}
        loading={loading}
      />

      <HomePortfolio
        projects={overview.projectCards}
        loading={loading}
      />
    </>
  );
}

function RefinedHome({ overview, loading }: { overview: OverviewPayload; loading: boolean }) {
  const t = useTranslations('home');
  return (
    <>
      <div className="v2-home-mode">
        <Button asChild variant="secondary" size="sm">
          <Link href="/?home=classic">{t('refined.classicView')}</Link>
        </Button>
      </div>

      <SectionIndex idx="01" label={t('sections.nextAction')} sub={t('sections.nextActionSub')} />
      <HomeFocus
        focus={overview.todayFocus}
        loading={loading}
      />

      <SectionIndex idx="02" label={t('sections.todaysBoard')} sub={t('sections.todaysBoardSub')} />
      <HomeBoard
        decisions={overview.decisionDeck}
        updates={overview.updates}
        teamPulse={overview.teamPulse}
        loading={loading}
        variant="refined"
      />

      <PortfolioSnapshot projects={overview.projectCards} loading={loading} />
    </>
  );
}

function PortfolioSnapshot({ projects, loading }: { projects: PortfolioRow[]; loading: boolean }) {
  const t = useTranslations('home');
  const visible = useMemo(() => {
    return [...projects]
      .sort((a, b) => {
        const pulseOrder = (p: PortfolioRow['pulse']) =>
          p === 'drifting' ? 0 : p === 'stuck' ? 1 : p === 'shipping' ? 2 : p === 'converging' ? 3 : 4;
        return pulseOrder(a.pulse) - pulseOrder(b.pulse);
      })
      .slice(0, 5);
  }, [projects]);

  return (
    <section className="v2-home-pf">
      <header className="v2-home-pf-head">
        <div className="v2-sec-idx" aria-label={t('portfolioSnapshot.ariaLabel')}>
          <span className="v2-sec-idx-num">03</span>
          <span className="v2-sec-idx-lab">{t('portfolioSnapshot.label')}</span>
        </div>
        <span className="v2-home-pf-grow" />
        <Link href="/projects" className="v2-home-pf-all">{t('portfolioSnapshot.viewAll')}</Link>
      </header>

      <div className="glass-card is-static v2-home-pf-card">
        {loading ? (
          <div className="v2-home-pf-skel">
            <span />
            <span />
            <span />
          </div>
        ) : projects.length === 0 ? (
          <p className="v2-home-pf-empty">{t('portfolioSnapshot.empty')}</p>
        ) : (
          <ul className="v2-home-pf-list">
            {visible.map((p) => {
              const risk = cleanText(p.topRisk) || cleanText(p.topNextStep) || t('portfolioSnapshot.noRisk');
              return (
                <li key={p.id} className="v2-home-pf-row" data-pulse={p.pulse}>
                  <Link href={`/projects/${p.id}`} className="v2-home-pf-link">
                    <span className="v2-home-pf-avatar" aria-hidden="true">
                      {p.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : projectInitial(p.name)}
                    </span>
                    <span className="v2-home-pf-main">
                      <span className="v2-home-pf-name">{p.name}</span>
                      <span className="v2-home-pf-risk">{risk}</span>
                    </span>
                    <span className="v2-home-pf-meta">
                      <span>{pulseShort(p.pulse)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function V2HomePage() {
  return (
    <Suspense fallback={<div className="v2-cockpit" />}>
      <V2HomeInner />
    </Suspense>
  );
}

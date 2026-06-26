'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTeam } from '@/components/TeamProvider';
import { shouldShowFirstRun, isFirstRunDismissed, dismissFirstRun } from '@/lib/firstRun';
import FirstRunChecklist from '@/components/v2/FirstRunChecklist';
import HomeFocus, { type FocusData } from '@/components/v2/HomeFocus';
import SectionIndex from '@/components/v2/SectionIndex';

// Home is now a *personal* cockpit. The team-level board and portfolio moved to
// the owner-only /admin mission-control page; Home answers a single question:
// "what should *I* work on now?" — so it keeps the personal focus card plus a
// compact pointer to the viewer's own tasks and calendar.
interface OverviewPayload {
  totalProjects: number;
  todayFocus: FocusData | null;
  // Only the count matters here (drives the first-run GitHub hint). Shape of the
  // individual entries is irrelevant now that the board/portfolio are gone.
  updates: unknown[];
}

const EMPTY_OVERVIEW: OverviewPayload = {
  totalProjects: 0,
  todayFocus: null,
  updates: [],
};

function mergeOverviewPayloads(payloads: OverviewPayload[]): OverviewPayload {
  if (payloads.length === 0) return EMPTY_OVERVIEW;
  const focuses = payloads.map((payload) => payload.todayFocus).filter((focus): focus is FocusData => Boolean(focus));
  focuses.sort((a, b) => (a.overallScore ?? 10) - (b.overallScore ?? 10));
  return {
    totalProjects: payloads.reduce((sum, payload) => sum + (payload.totalProjects ?? 0), 0),
    todayFocus: focuses[0] ?? null,
    updates: payloads.flatMap((payload) => payload.updates ?? []).slice(0, 6),
  };
}

// V2 Home — the operator's *personal* cockpit.
//
// Two sections, in priority order:
//   1. HomeFocus  — what's my single most important product right now?
//   2. YourWork   — pointers into my own tasks + calendar.
//
// Team-wide views (decisions stack, team board, portfolio, team pulse) live on
// the owner-only /admin page now — Home stays lean and personal.
function V2HomeInner() {
  const t = useTranslations('home');
  const { currentTeam, selectedTeamIds } = useTeam();
  const teamId = currentTeam?.id ?? null;

  const teamScopeKey = selectedTeamIds.join(',');

  // One cached fetch — the overview (focus + project count). SWR keeps it keyed
  // by team scope so returning to this tab paints the last-known data instantly
  // and revalidates silently. The skeleton shows only on the genuine first load.
  const { data: overviewPayloads } = useSWR<OverviewPayload[]>(
    selectedTeamIds.length > 0 ? ['home-overview', teamScopeKey] : null,
    async () => Promise.all(selectedTeamIds.map(async (selectedTeamId) => {
      const url = selectedTeamId === teamId
        ? `/api/overview?teamId=${teamId}`
        : `/api/overview?teamId=${selectedTeamId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`overview ${response.status}`);
      return response.json() as Promise<OverviewPayload>;
    })),
  );

  const loading = selectedTeamIds.length > 0 && overviewPayloads === undefined;

  const overview: OverviewPayload = useMemo(
    () => mergeOverviewPayloads(overviewPayloads ?? []),
    [overviewPayloads],
  );

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
  // connected. No extra fetch.
  const hasGithub = overview.updates.length > 0;
  const showFirstRun =
    !loading &&
    shouldShowFirstRun({ projectCount: overview.totalProjects, dismissed });

  return (
    <div className="v2-cockpit">
      {showFirstRun ? (
        <FirstRunChecklist
          hasProjects={overview.totalProjects > 0}
          hasGithub={hasGithub}
          teammateCount={0}
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
      ) : (
        <>
          <SectionIndex idx="01" label={t('sections.focus')} sub={t('sections.focusSub')} />
          <HomeFocus
            focus={overview.todayFocus}
            loading={loading}
          />

          <SectionIndex idx="02" label={t('sections.yourWork')} sub={t('sections.yourWorkSub')} />
          <div className="v2-yourwork">
            <Link href="/tasks" className="glass-card is-static v2-yw-card">
              <span className="v2-yw-title">{t('yourWork.tasksTitle')}</span>
              <span className="v2-yw-sub">{t('yourWork.tasksSub')}</span>
              <svg className="v2-yw-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link href="/calendar" className="glass-card is-static v2-yw-card">
              <span className="v2-yw-title">{t('yourWork.calendarTitle')}</span>
              <span className="v2-yw-sub">{t('yourWork.calendarSub')}</span>
              <svg className="v2-yw-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </>
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
          min-height: 26px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .v2-sec-idx-num {
          font-size: 11px;
          letter-spacing: 0.6px;
          color: var(--signature);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          padding: 2px 7px;
          background: rgba(var(--signature-rgb), 0.11);
          border: 1px solid rgba(var(--signature-rgb), 0.2);
          border-radius: 6px;
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.06);
        }
        .v2-sec-idx-lab {
          font-size: 11px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--txt-pure);
          font-weight: 700;
        }
        .v2-sec-idx-sub {
          margin-left: 6px;
          font-size: 10px;
          letter-spacing: 0;
          color: var(--txt-muted);
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

        /* --- YOUR WORK — two compact pointer cards into the viewer's own
           tasks + calendar. Links only; the real views live on those pages. */
        .v2-yourwork {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .v2-yw-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 18px 46px 18px 20px;
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
        }
        .v2-yw-card:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--signature-rgb), 0.34);
        }
        .v2-yw-title {
          font-size: 14px;
          font-weight: 650;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
        }
        .v2-yw-sub {
          font-size: 12px;
          line-height: 1.4;
          color: var(--txt-muted);
        }
        .v2-yw-arrow {
          position: absolute;
          top: 50%;
          right: 18px;
          transform: translateY(-50%);
          color: var(--txt-faint);
          transition: transform 180ms ease, color 180ms ease;
        }
        .v2-yw-card:hover .v2-yw-arrow {
          color: var(--signature);
          transform: translateY(-50%) translateX(3px);
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
          .v2-yourwork { grid-template-columns: 1fr; }
          .v2-empty-hero { grid-template-columns: 1fr; gap: 18px; }
          .v2-empty-num { font-size: 56px; }
        }
      `}</style>
    </div>
  );
}

export default function V2HomePage() {
  return (
    <Suspense fallback={<div className="v2-cockpit" />}>
      <V2HomeInner />
    </Suspense>
  );
}

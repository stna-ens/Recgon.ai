'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import type { AgentTask } from '@/lib/recgon/types';
import { Skeleton, EmptyState } from '@/components/ui';
import { WeekHeader } from './WeekHeader';
import { PersonalLane } from './PersonalLane';
import { TaskDetailPanel } from './TaskDetailPanel';
import type { CalendarCard, WeekRange } from './calendarTypes';
import { addWeeks, buildCards, getWeekRange, localDateKey, weekDays } from './calendarUtils';

type TeamRef = { id: string; name: string; avatarColor: string | null };
type ProjectRef = { id: string; name: string; logoUrl: string | null; teamId: string | null };
type ServerData = { tasks: AgentTask[]; teams: TeamRef[]; projects?: ProjectRef[] };

const FILTER_STORAGE_KEY = 'v2:calendar:teamFilter';
const SYNTHETIC_TEAMMATE_ID = '__me__';
const NO_PROJECT_KEY = '__no_project__';

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

function fmtEditorial(start: Date, end: Date, month: (i: number) => string): { primary: string; year: string } {
  const sm = month(start.getMonth());
  const em = month(end.getMonth());
  const primary = sm === em
    ? `${sm} ${start.getDate()} — ${end.getDate()}`
    : `${sm} ${start.getDate()} — ${em} ${end.getDate()}`;
  const year = `/ ${end.getFullYear()}`;
  return { primary, year };
}

export function PersonalCalendar() {
  const t = useTranslations('calendar');
  const [weekRange, setWeekRange] = useState<WeekRange>(() => getWeekRange(new Date()));
  const fromKey = localDateKey(weekRange.start);
  const toKey = localDateKey(weekRange.end);
  // SWR keyed by the visible week range — returning to a week you've already
  // viewed paints instantly from cache; only a never-seen range shows the
  // skeleton. Background revalidation (incl. on focus, via SWRConfig) surfaces
  // the small nav spinner instead of the full skeleton.
  const { data, isValidating, mutate } = useSWR<ServerData>(`/api/calendar?from=${fromKey}&to=${toKey}`);
  const loading = data === undefined;
  const refreshing = isValidating && data !== undefined;
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  // Task opened in the detail panel. Stored by id so the panel always reflects
  // the freshest server data (it re-derives from `data` after a refresh).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Personal calendar only ever lists the viewer's own tasks, so the viewer is
  // always the assignee — currentTeammateId = the task's assignee row.
  const selectedTask = useMemo(
    () => (selectedTaskId ? data?.tasks.find((tk) => tk.id === selectedTaskId) ?? null : null),
    [selectedTaskId, data],
  );
  const filterMenuRef = useRef<HTMLDivElement>(null);
  // Persist filter choice across reloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) setSelectedTeamId(stored);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedTeamId) window.localStorage.setItem(FILTER_STORAGE_KEY, selectedTeamId);
    else window.localStorage.removeItem(FILTER_STORAGE_KEY);
  }, [selectedTeamId]);

  // Self-heal a stale team filter: if the persisted selectedTeamId does not
  // match any team in the current server response (for example, the user has
  // switched accounts or left the previously-filtered team), clear it so the
  // calendar falls back to "all teams" instead of silently hiding everything.
  // Without this, a stored filter from a previous session can render the
  // calendar permanently blank with no visible filter UI to undo it (the
  // filter trigger only renders when teams.length > 1).
  useEffect(() => {
    if (!data) return;
    if (!selectedTeamId) return;
    const knownTeamIds = new Set(data.teams.map((t) => t.id));
    if (!knownTeamIds.has(selectedTeamId)) {
      setSelectedTeamId(null);
    }
  }, [data, selectedTeamId]);

  // Single-day mode on narrow screens.
  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 700) {
        const today = new Date();
        const days = weekDays(weekRange);
        const todayIdx = days.findIndex(
          (d) => d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(),
        );
        setActiveDayIndex(todayIdx >= 0 ? todayIdx : 0);
      } else {
        setActiveDayIndex(null);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [weekRange]);

  // Close the filter menu on outside click / escape.
  useEffect(() => {
    if (!filterMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!filterMenuRef.current?.contains(e.target as Node)) setFilterMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [filterMenuOpen]);

  const days = useMemo(() => weekDays(weekRange), [weekRange]);

  const filteredTasks = useMemo(() => {
    const all = data?.tasks ?? [];
    if (!selectedTeamId) return all;
    return all.filter((t) => t.teamId === selectedTeamId);
  }, [data, selectedTeamId]);

  // Build one lane per project the user currently has scheduled tasks in
  // (across all dates — see `/api/calendar`), regardless of whether that
  // project has cards in the visible week. This keeps the lane structure
  // stable as the user navigates weeks. Tasks with no projectId fall into
  // a single "no project" lane that only appears when such tasks exist.
  const projectLanes = useMemo<Array<{ key: string; project: ProjectRef | null; cards: CalendarCard[] }>>(() => {
    const allProjects = data?.projects ?? [];
    const teamScopedProjects = selectedTeamId
      ? allProjects.filter((p) => p.teamId === selectedTeamId)
      : allProjects;

    const tasksByProjectKey = new Map<string, AgentTask[]>();
    for (const t of filteredTasks) {
      const key = t.projectId ?? NO_PROJECT_KEY;
      const arr = tasksByProjectKey.get(key) ?? [];
      arr.push(t);
      tasksByProjectKey.set(key, arr);
    }

    const cardsForKey = (key: string): CalendarCard[] => {
      const list = tasksByProjectKey.get(key) ?? [];
      if (list.length === 0) return [];
      const remapped = list.map((t) => ({ ...t, assignedTo: SYNTHETIC_TEAMMATE_ID }));
      return buildCards(remapped, SYNTHETIC_TEAMMATE_ID, weekRange);
    };

    const lanes: Array<{ key: string; project: ProjectRef | null; cards: CalendarCard[] }> = [];
    for (const project of teamScopedProjects) {
      lanes.push({ key: project.id, project, cards: cardsForKey(project.id) });
    }

    // Only render the "no project" bucket when there are matching tasks.
    if ((tasksByProjectKey.get(NO_PROJECT_KEY) ?? []).length > 0) {
      lanes.push({ key: NO_PROJECT_KEY, project: null, cards: cardsForKey(NO_PROJECT_KEY) });
    }

    lanes.sort((a, b) => {
      if (a.key === NO_PROJECT_KEY) return 1;
      if (b.key === NO_PROJECT_KEY) return -1;
      const an = a.project?.name ?? a.key;
      const bn = b.project?.name ?? b.key;
      return an.localeCompare(bn);
    });
    return lanes;
  }, [filteredTasks, data?.projects, selectedTeamId, weekRange]);

  const teamBadgeByTeamId = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const team of data?.teams ?? []) {
      map.set(team.id, { name: team.name, color: team.avatarColor });
    }
    return map;
  }, [data]);

  const handlePrev = () => setWeekRange((w) => addWeeks(w, -1));
  const handleNext = () => setWeekRange((w) => addWeeks(w, 1));
  const handleToday = () => setWeekRange(getWeekRange(new Date()));

  const handleDayNav = (delta: number) => {
    setActiveDayIndex((prev) => {
      if (prev === null) return null;
      const next = prev + delta;
      if (next < 0) { setWeekRange((w) => addWeeks(w, -1)); return 6; }
      if (next > 6) { setWeekRange((w) => addWeeks(w, 1)); return 0; }
      return next;
    });
  };

  const teams = data?.teams ?? [];
  const { primary, year } = fmtEditorial(weekRange.start, weekRange.end, (i) => t(`months.${MONTH_KEYS[i]}`));
  const filterLabel = selectedTeamId
    ? (teams.find((team) => team.id === selectedTeamId)?.name ?? t('filter.team'))
    : t('filter.allTeams');

  return (
    <div className="personal-cal-root">
      <div className="cal-nav">
        <div className="cal-nav-left">
          <span className="cal-nav-eyebrow">{t('nav.yourWeek')}</span>
          <h1 className="cal-nav-headline">
            <span className="cal-nav-headline-primary">{primary}</span>
            <span className="cal-nav-headline-year">{year}</span>
          </h1>
          {refreshing && <span className="cal-nav-spin" aria-hidden="true" />}
        </div>

        <div className="cal-nav-right">
          <div className="cal-nav-pager">
            <button
              type="button"
              className="cal-nav-arrow"
              onClick={activeDayIndex !== null ? () => handleDayNav(-1) : handlePrev}
              aria-label={t('nav.prev')}
            >
              ‹
            </button>
            <button type="button" className="cal-nav-today-link" onClick={handleToday}>{t('nav.today')}</button>
            <button
              type="button"
              className="cal-nav-arrow"
              onClick={activeDayIndex !== null ? () => handleDayNav(1) : handleNext}
              aria-label={t('nav.next')}
            >
              ›
            </button>
          </div>

          {teams.length > 1 && (
            <div className="cal-view-menu" ref={filterMenuRef}>
              <button
                type="button"
                className={`cal-view-trigger${filterMenuOpen ? ' is-open' : ''}`}
                onClick={() => setFilterMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={filterMenuOpen}
              >
                <span
                  className="cal-view-trigger-dot"
                  style={{
                    background: selectedTeamId
                      ? teams.find((team) => team.id === selectedTeamId)?.avatarColor ?? 'var(--signature)'
                      : 'var(--signature)',
                  }}
                  aria-hidden="true"
                />
                <span className="cal-view-trigger-text">{filterLabel}</span>
                <span className="cal-view-trigger-chev" aria-hidden="true">⌄</span>
              </button>
              {filterMenuOpen && (
                <div className="cal-view-menu-panel" role="menu" aria-label={t('filter.menuAria')}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedTeamId === null}
                    className={`cal-view-option${selectedTeamId === null ? ' is-active' : ''}`}
                    onClick={() => { setSelectedTeamId(null); setFilterMenuOpen(false); }}
                  >
                    <span className="cal-view-option-label">{t('filter.allTeams')}</span>
                    {selectedTeamId === null && <span className="cal-view-option-mark" aria-hidden="true">•</span>}
                  </button>
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedTeamId === team.id}
                      className={`cal-view-option${selectedTeamId === team.id ? ' is-active' : ''}`}
                      onClick={() => { setSelectedTeamId(team.id); setFilterMenuOpen(false); }}
                    >
                      <span
                        className="cal-view-option-dot"
                        style={{ background: team.avatarColor ?? 'var(--signature)' }}
                        aria-hidden="true"
                      />
                      <span className="cal-view-option-label">{team.name}</span>
                      {selectedTeamId === team.id && <span className="cal-view-option-mark" aria-hidden="true">•</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="personal-cal-loading" aria-busy="true" aria-live="polite">
          <div className="personal-cal-skel-grid">
            <div className="personal-cal-skel-corner">
              <Skeleton width="60%" height={11} />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`h-${i}`} className="personal-cal-skel-head">
                <Skeleton width={28} height={11} />
                <Skeleton width={20} height={20} radius={6} />
              </div>
            ))}
            {[0, 1, 2].map((row) => (
              <Fragment key={`r-${row}`}>
                <div className="personal-cal-skel-label">
                  <Skeleton width={18} height={18} radius={5} />
                  <Skeleton width="55%" height={11} />
                </div>
                {Array.from({ length: 7 }).map((_, ci) => (
                  <div key={`c-${row}-${ci}`} className="personal-cal-skel-cell">
                    {(row + ci) % 3 === 0 && <Skeleton width="86%" height={26} radius={8} />}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          <span className="personal-cal-skel-loading-label">{t('loading')}</span>
        </div>
      ) : (
        <div className="personal-cal-outer">
          <div className="personal-cal-scroll">
            <div
              className="personal-cal-grid"
              style={{ gridTemplateColumns: `var(--cal-label-width, 180px) repeat(${activeDayIndex !== null ? 1 : 7}, minmax(0, 1fr))` }}
            >
              <WeekHeader dayDates={days} activeDayIndex={activeDayIndex} rowLabel="project" />
              {projectLanes.length === 0 ? (
                <div className="personal-cal-empty" style={{ gridColumn: `1 / ${(activeDayIndex !== null ? 1 : 7) + 2}` }}>
                  <EmptyState
                    compact
                    icon="◇"
                    title={t('empty.noScheduledTitle')}
                    description={t('empty.noScheduledDesc')}
                  />
                </div>
              ) : (
                projectLanes.map((lane) => (
                  <PersonalLane
                    key={lane.key}
                    cards={lane.cards}
                    dayDates={days}
                    activeDayIndex={activeDayIndex}
                    onCardClick={(card) => setSelectedTaskId(card.task.id)}
                    teamBadgeByTeamId={teamBadgeByTeamId}
                    label={lane.project?.name ?? t('lane.noProject')}
                    eyebrow={lane.project ? t('lane.project') : t('lane.noProjectEyebrow')}
                    logoUrl={lane.project?.logoUrl ?? null}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <TaskDetailPanel
        task={selectedTask}
        isOpen={selectedTask != null}
        currentTeammateId={selectedTask?.assignedTo ?? null}
        isOwner={false}
        onClose={() => setSelectedTaskId(null)}
        onRefresh={() => { void mutate(); }}
      />

      <style>{css}</style>
    </div>
  );
}

const css = `
.personal-cal-root {
  display: flex;
  flex-direction: column;
  gap: 0;
  animation: personalCalFade 500ms cubic-bezier(0.2,0.8,0.2,1) both;
  --cal-label-width: 180px;
  --cal-day-min-width: 110px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
@keyframes personalCalFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.cal-nav {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding: 4px 0 22px;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 14px;
}
.cal-nav-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
}
.cal-nav-right {
  display: flex;
  align-items: center;
  gap: 22px;
}
.cal-nav-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--signature);
  text-transform: uppercase;
  padding-top: 4px;
  flex-shrink: 0;
}
.cal-nav-headline {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 600;
  line-height: 1;
}
.cal-nav-headline-primary {
  font-size: 26px;
  letter-spacing: -0.01em;
  color: var(--txt-pure);
}
.cal-nav-headline-year {
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-faint);
  letter-spacing: 0.6px;
  text-transform: uppercase;
}
.cal-nav-spin {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--signature-rgb), 0.25);
  border-top-color: var(--signature);
  animation: personalCalSpin 700ms linear infinite;
  display: inline-block;
  margin-left: 4px;
  align-self: center;
}
@keyframes personalCalSpin { to { transform: rotate(360deg); } }

.cal-nav-pager { display: inline-flex; align-items: center; gap: 4px; }
.cal-nav-arrow {
  background: transparent;
  border: none;
  color: var(--txt-muted);
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  transition: color var(--dur-fast) ease;
}
.cal-nav-arrow:hover { color: var(--txt-pure); }
.cal-nav-arrow:focus-visible { outline: 2px solid var(--signature); outline-offset: 2px; border-radius: 2px; }
.cal-nav-today-link {
  background: transparent;
  border: none;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--txt-muted);
  padding: 4px 6px;
  cursor: pointer;
  transition: color var(--dur-fast) ease;
}
.cal-nav-today-link:hover { color: var(--signature); }

.cal-view-menu { position: relative; display: inline-flex; }
.cal-view-trigger {
  min-width: 152px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px 7px 12px;
  background: transparent;
  border: 1px solid var(--rule, rgba(255,255,255,0.10));
  border-radius: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--txt-faint);
  cursor: pointer;
  transition: border-color var(--dur-base) ease, color var(--dur-base) ease, background var(--dur-base) ease;
}
.cal-view-trigger:hover, .cal-view-trigger.is-open {
  color: var(--txt-muted);
  border-color: rgba(var(--signature-rgb), 0.35);
  background: rgba(var(--signature-rgb), 0.03);
}
.cal-view-trigger-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--signature);
  flex-shrink: 0;
}
.cal-view-trigger-text {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-view-trigger-chev { font-size: 12px; color: var(--txt-faint); transform: translateY(-1px); }
.cal-view-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  min-width: 180px;
  padding: 6px;
  background: var(--bg-card, rgba(20, 20, 22, 0.92));
  border: 1px solid var(--rule, rgba(255,255,255,0.10));
  border-radius: 10px;
  backdrop-filter: blur(32px) saturate(160%);
  -webkit-backdrop-filter: blur(32px) saturate(160%);
  box-shadow: var(--v2-shadow-strong, 0 22px 50px -22px rgba(0,0,0,0.45));
}
.cal-view-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: var(--txt-muted);
  cursor: pointer;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
  text-align: left;
}
.cal-view-option:hover { background: rgba(var(--signature-rgb), 0.06); color: var(--txt-pure); }
.cal-view-option.is-active { color: var(--txt-pure); }
.cal-view-option-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cal-view-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-view-option-mark { color: var(--signature); text-shadow: 0 0 8px var(--signature); }

.personal-cal-outer {
  display: block;
  border: 1px solid var(--rule);
  border-radius: 28px;
  overflow: hidden;
  background: var(--bg-card, rgba(30,30,35,0.55));
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  width: 100%;
}
.personal-cal-scroll {
  width: 100%;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color var(--dur-base) ease;
}
.personal-cal-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.personal-cal-scroll::-webkit-scrollbar-track { background: transparent; }
.personal-cal-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background var(--dur-base) ease;
}
.personal-cal-scroll:hover { scrollbar-color: rgba(var(--signature-rgb), 0.30) transparent; }
.personal-cal-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(var(--signature-rgb), 0.30);
  background-clip: padding-box;
}
.personal-cal-grid { display: grid; min-width: 0; width: 100%; }

.personal-cal-loading {
  position: relative;
  border: 1px solid var(--rule);
  border-radius: 28px;
  overflow: hidden;
  background: var(--bg-card, rgba(30,30,35,0.55));
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.personal-cal-skel-grid {
  display: grid;
  grid-template-columns: var(--cal-label-width, 180px) repeat(7, minmax(var(--cal-day-min-width, 110px), 1fr));
}
.personal-cal-skel-corner,
.personal-cal-skel-head {
  height: 64px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.personal-cal-skel-label,
.personal-cal-skel-cell {
  height: 96px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 10px;
}
.personal-cal-skel-cell { justify-content: center; }
.personal-cal-skel-loading-label {
  position: absolute;
  bottom: 14px;
  right: 16px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--signature);
  opacity: 0.7;
}

.personal-cal-empty {
  display: flex;
  justify-content: center;
}

@media (max-width: 700px) {
  .personal-cal-root { --cal-label-width: 48px; --cal-day-min-width: 0px; }
  .personal-cal-grid { min-width: unset; }
  .personal-lane-label-name { display: none; }
  .cal-nav { padding: 4px 0 14px; margin-bottom: 10px; }
  .cal-nav-headline-primary { font-size: 20px; }
  .cal-nav-right { gap: 14px; }
}
`;

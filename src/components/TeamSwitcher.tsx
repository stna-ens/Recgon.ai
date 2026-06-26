'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useTeam } from './TeamProvider';
import { TeammateAvatar } from '@/components/v2/TeammateAvatar';
import { useTeamPortfolio, groupByTeam } from '@/components/v2/projects/useTeamPortfolio';
import { pulseShort, projectInitial } from '@/components/v2/utils';

const EXPANDED_KEY = 'recgon_expanded_teams';

export default function TeamSwitcher() {
  const t = useTranslations('teams');
  const { teams, selectedTeamIds, setSelectedTeamIds, projectScope, setProjectScope } = useTeam();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy: only load the cross-team portfolio once the dropdown has been opened,
  // so the topnav doesn't fetch every team's projects on every page load. Shares
  // the SWR cache with the Projects page.
  const { portfolio, portfolioMeta, loading: projectsLoading } = useTeamPortfolio(hasOpened);
  const projectsByTeam = useMemo(() => groupByTeam(portfolio, portfolioMeta), [portfolio, portfolioMeta]);

  // Hydrate per-team expand state from localStorage (default: selected teams open).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) {
        setExpanded(JSON.parse(raw));
      } else {
        setExpanded(Object.fromEntries(selectedTeamIds.map((id) => [id, true])));
      }
    } catch {
      /* ignore */
    }
    // Run once on mount; selectedTeamIds only seeds the initial default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Clear hover timers on unmount.
  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (teams.length === 0) return null;

  const allSelected = selectedTeamIds.length === teams.length;
  const selectedTeams = teams.filter((team) => selectedTeamIds.includes(team.id));
  const triggerLabel = allSelected && teams.length > 1
    ? t('switcher.allTeams')
    : selectedTeams.length === 1
      ? selectedTeams[0].name
      : t('switcher.teamCount', { count: selectedTeams.length });

  const doOpen = () => {
    setOpen(true);
    setHasOpened(true);
  };
  const close = () => {
    setOpen(false);
    setPinned(false);
  };

  // Hover opens after a short intent delay; a click pins it open (so it doesn't
  // close when the mouse drifts off). Touch falls back to the click path.
  const onMouseEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) return;
    openTimer.current = setTimeout(doOpen, 120);
  };
  const onMouseLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (pinned) return;
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  const toggleOpen = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (open && pinned) close();
    else {
      doOpen();
      setPinned(true);
    }
  };

  const toggleTeam = (teamId: string) => {
    const active = selectedTeamIds.includes(teamId);
    if (active && selectedTeamIds.length === 1) return; // never leave zero teams selected
    setSelectedTeamIds(
      active
        ? selectedTeamIds.filter((id) => id !== teamId)
        : [...selectedTeamIds, teamId],
    );
  };

  // Mark/unmark a project within its team's scope. Starting from "all" (no
  // marks) narrows to just the clicked project; clearing the last mark or
  // marking every project collapses back to "all" (empty). Marking a project
  // under an unselected team pulls that team into scope too.
  const toggleProjectMark = (teamId: string, projectId: string, allIds: string[]) => {
    if (!selectedTeamIds.includes(teamId)) {
      setSelectedTeamIds([...selectedTeamIds, teamId]);
    }
    const current = projectScope[teamId] ?? [];
    let next: string[];
    if (current.length === 0) {
      next = [projectId];
    } else if (current.includes(projectId)) {
      next = current.filter((id) => id !== projectId);
    } else {
      next = [...current, projectId];
    }
    // Every project marked ⇒ same as "all" ⇒ store as empty.
    if (allIds.length > 0 && next.length >= allIds.length) next = [];
    setProjectScope({ ...projectScope, [teamId]: next });
  };

  const toggleExpand = (teamId: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [teamId]: !prev[teamId] };
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div
      ref={ref}
      className="team-filter-root"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className="team-filter-trigger"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('switcher.filterAria', { selection: triggerLabel })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--signature)" strokeWidth={2} aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M17 11h6" />
        </svg>
        <span className="team-filter-trigger-label" title={selectedTeams.map((team) => team.name).join(', ')}>
          {triggerLabel}
        </span>
        {selectedTeamIds.length > 1 && <span className="team-filter-count">{selectedTeamIds.length}</span>}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className="team-filter-chevron" data-open={open ? 'true' : 'false'} aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="team-filter-menu" role="menu" aria-label={t('switcher.teamFilter')}>
          <div className="team-filter-options">
            {teams.length > 1 && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={allSelected}
                className="team-filter-allrow"
                onClick={() => setSelectedTeamIds(teams.map((team) => team.id))}
              >
                <span className="tf-box" data-on={allSelected ? 'true' : 'false'} aria-hidden="true">
                  {allSelected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="team-filter-name">{t('switcher.allTeams')}</span>
                <span className="team-filter-allcount">{t('switcher.teamCount', { count: teams.length })}</span>
              </button>
            )}

            {teams.map((team) => {
              const active = selectedTeamIds.includes(team.id);
              const isExpanded = !!expanded[team.id];
              const projects = projectsByTeam[team.id] ?? [];
              const hasProjects = projects.length > 0;
              // Allow expanding until we positively know the team is empty.
              const canExpand = !hasOpened || projectsLoading || hasProjects;
              const showProjects = isExpanded && canExpand;
              return (
                <div
                  key={team.id}
                  className="team-filter-team"
                  data-active={active ? 'true' : 'false'}
                  data-expanded={showProjects ? 'true' : 'false'}
                >
                  <div className="team-filter-teamrow">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      className="team-filter-check"
                      aria-label={t('switcher.toggleFilterAria', { team: team.name })}
                      onClick={() => toggleTeam(team.id)}
                    >
                      <span className="tf-box" data-on={active ? 'true' : 'false'} aria-hidden="true">
                        {active && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="team-filter-teammain"
                      aria-expanded={showProjects}
                      aria-label={t('switcher.toggleProjectsAria', { team: team.name })}
                      onClick={() => { if (canExpand) toggleExpand(team.id); }}
                    >
                      <TeammateAvatar
                        name={team.name}
                        avatarUrl={(team as { avatarUrl?: string }).avatarUrl}
                        avatarColor={(team as { avatarColor?: string }).avatarColor}
                        size={26}
                        isIdle={!active}
                      />
                      <span className="team-filter-identity">
                        <span className="team-filter-name">{team.name}</span>
                        <span className="team-filter-role">{t(`roles.${team.role}`)}</span>
                      </span>
                      {canExpand && (
                        <svg
                          className="team-filter-chev" data-open={showProjects ? 'true' : 'false'} aria-hidden="true"
                          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {canExpand && (
                    <div className="team-filter-projwrap" data-expanded={showProjects ? 'true' : 'false'}>
                      <div className="team-filter-projwrap-inner">
                        <ul className="team-filter-projects">
                          {hasProjects ? (
                            projects.map((p) => {
                              const marks = projectScope[team.id] ?? [];
                              const projChecked = active && (marks.length === 0 || marks.includes(p.id));
                              const allIds = projects.map((pr) => pr.id);
                              return (
                              <li key={p.id} className="team-filter-projrow">
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={projChecked}
                                  className="team-filter-projcheck"
                                  aria-label={t('switcher.toggleProjectFilterAria', { project: p.name })}
                                  onClick={() => toggleProjectMark(team.id, p.id, allIds)}
                                >
                                  <span className="tf-box tf-box-sm" data-on={projChecked ? 'true' : 'false'} aria-hidden="true">
                                    {projChecked && (
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5}>
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    )}
                                  </span>
                                </button>
                                <Link
                                  href={`/projects/${p.id}`}
                                  className="team-filter-project"
                                  onClick={close}
                                >
                                  <span className="team-filter-project-logo" aria-hidden="true">
                                    {p.logoUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element -- user-supplied logo URL; hosts can't be enumerated for next/image
                                      <img src={p.logoUrl} alt="" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).textContent = projectInitial(p.name); }} />
                                    ) : (
                                      projectInitial(p.name)
                                    )}
                                  </span>
                                  <span className="team-filter-project-name">{p.name}</span>
                                  <span className="team-filter-project-status" data-pulse={p.pulse}>
                                    <span className="team-filter-project-dot" data-pulse={p.pulse} aria-hidden="true" />
                                    {pulseShort(p.pulse)}
                                  </span>
                                </Link>
                              </li>
                              );
                            })
                          ) : (
                            <li className="team-filter-projhint">
                              {projectsLoading ? t('switcher.loadingProjects') : t('switcher.noProjects')}
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="team-filter-foot">
            <Link href="/projects" className="team-filter-footlink" onClick={close}>
              {t('switcher.allProjects')}
            </Link>
            <Link href="/teams" className="team-filter-footlink" onClick={close}>
              {t('switcher.manageTeams')}
            </Link>
          </div>
        </div>
      )}

      <style>{`
        .team-filter-root { position: relative; }
        .team-filter-trigger {
          min-width: 122px; max-width: 190px; height: 36px; padding: 0 12px;
          display: flex; align-items: center; gap: 8px;
          background: var(--glass-substrate); color: var(--txt-pure);
          border: 1px solid ${open ? 'rgba(var(--signature-rgb), .42)' : 'var(--rule-strong)'};
          border-radius: 11px; cursor: pointer; font-size: 12px; font-weight: 650;
          box-shadow: ${open ? '0 0 0 3px rgba(var(--signature-rgb), .10)' : 'none'};
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .team-filter-trigger:hover { background: rgba(var(--signature-rgb), .07); border-color: rgba(var(--signature-rgb), .34); }
        .team-filter-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: left; }
        .team-filter-count {
          min-width: 17px; height: 17px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center;
          border-radius: 999px; color: var(--signature); background: rgba(var(--signature-rgb), .14);
          font: 700 9px/1 'JetBrains Mono', monospace;
        }
        .team-filter-chevron { flex: 0 0 auto; opacity: .5; transition: transform 160ms ease; }
        .team-filter-chevron[data-open='true'] { transform: rotate(180deg); }

        /* Solid, opaque panel — no page bleed-through. Dark base; light below. */
        .team-filter-menu {
          position: absolute; top: calc(100% + 9px); right: 0; width: 300px; overflow: hidden; z-index: 1000;
          background: #18181b; border: 1px solid var(--rule-strong); border-radius: 13px;
          box-shadow: var(--shadow-deep), inset 0 1px 0 rgba(var(--signature-rgb), .16);
          animation: teamFilterIn 150ms cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes teamFilterIn { from { opacity: 0; transform: translateY(-5px) scale(.985); } }

        .team-filter-options { padding: 0; max-height: 420px; overflow-y: auto; }

        /* On-brand square checkbox = the filter toggle. Not a browser checkbox. */
        .tf-box {
          width: 15px; height: 15px; border-radius: 4px; flex: 0 0 auto;
          border: 1px solid var(--rule-strong); color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .tf-box[data-on='true'] { background: var(--signature); border-color: var(--signature); }
        .tf-box svg { width: 10px; height: 10px; }

        /* "All teams" select-all row. */
        .team-filter-allrow {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 11px 16px; border: 0; border-bottom: 1px solid var(--rule);
          background: transparent; cursor: pointer; text-align: left;
          transition: background 120ms ease;
        }
        .team-filter-allrow:hover { background: rgba(255,255,255,.04); }
        .team-filter-allrow:focus-visible { outline: none !important; box-shadow: none !important; background: rgba(255,255,255,.04); }
        .team-filter-allcount { margin-left: auto; color: var(--txt-faint); font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: .3px; }

        /* Each team = a collapsible group: flat, full-bleed, hairline-separated. */
        .team-filter-team { border-bottom: 1px solid var(--rule); }
        .team-filter-teamrow { display: flex; align-items: stretch; }

        .team-filter-check {
          flex: 0 0 auto; display: inline-flex; align-items: center;
          padding: 0 10px 0 16px; border: 0; background: transparent; cursor: pointer;
        }
        .team-filter-check:focus-visible { outline: none !important; }
        .team-filter-check:focus-visible .tf-box { box-shadow: 0 0 0 3px rgba(var(--signature-rgb), .28); }

        .team-filter-teammain {
          flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px;
          padding: 12px 14px 12px 2px; border: 0; background: transparent; cursor: pointer; text-align: left;
          transition: background 120ms ease;
        }
        .team-filter-teammain:hover { background: rgba(255,255,255,.04); }
        .team-filter-teammain:focus-visible { outline: none !important; box-shadow: none !important; background: rgba(255,255,255,.04); }

        .team-filter-identity { display: flex; flex-direction: column; min-width: 0; }
        .team-filter-name {
          font: 700 10px/1.2 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .6px; text-transform: uppercase;
          color: var(--txt-pure); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .team-filter-role {
          margin-top: 2px;
          font: 400 10px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .8px; text-transform: uppercase;
          color: var(--txt-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .team-filter-team[data-active='false'] .team-filter-name { color: var(--txt-muted); }

        .team-filter-chev { margin-left: auto; flex: 0 0 auto; color: var(--txt-faint); transition: transform 160ms ease, color 120ms ease; }
        .team-filter-team[data-expanded='true'] .team-filter-chev { transform: rotate(90deg); color: var(--signature); }

        /* Project sub-rows — flat, left-aligned, logo on the left, pulse as a
           dot + word. Revealed via a grid-rows height animation (smooth both
           ways), with the inner content fading + sliding in. */
        .team-filter-projwrap {
          display: grid; grid-template-rows: 0fr;
          transition: grid-template-rows 240ms cubic-bezier(.16,1,.3,1);
        }
        .team-filter-projwrap[data-expanded='true'] { grid-template-rows: 1fr; }
        .team-filter-projwrap-inner {
          overflow: hidden; min-height: 0;
          opacity: 0; transform: translateY(-3px);
          transition: opacity 200ms ease, transform 240ms cubic-bezier(.16,1,.3,1);
        }
        .team-filter-projwrap[data-expanded='true'] .team-filter-projwrap-inner { opacity: 1; transform: none; }

        .team-filter-projects { list-style: none; margin: 0; padding: 2px 0 8px; }

        /* A project row = [filter checkbox] + [navigation link], mirroring the
           team row's check + main split. The checkbox occupies the indent the
           link used to pad past. */
        .team-filter-projrow { display: flex; align-items: stretch; }
        .team-filter-projcheck {
          flex: 0 0 auto; display: inline-flex; align-items: center;
          padding: 0 8px 0 18px; border: 0; background: transparent; cursor: pointer;
        }
        .team-filter-projcheck:focus-visible { outline: none !important; }
        .team-filter-projcheck:focus-visible .tf-box { box-shadow: 0 0 0 3px rgba(var(--signature-rgb), .28); }
        .tf-box-sm { width: 13px; height: 13px; border-radius: 3px; }
        .tf-box-sm svg { width: 9px; height: 9px; }

        .team-filter-project {
          flex: 1; min-width: 0;
          display: flex; align-items: center; gap: 9px;
          padding: 6px 16px 6px 2px; text-decoration: none;
          transition: background 120ms ease;
        }
        .team-filter-project:hover { background: rgba(255,255,255,.04); }
        .team-filter-project:focus-visible { outline: none !important; box-shadow: none !important; background: rgba(255,255,255,.04); }

        /* Project logo (image or initial) — sits to the left of the name. */
        .team-filter-project-logo {
          width: 20px; height: 20px; border-radius: 5px; flex: 0 0 auto; overflow: hidden;
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(var(--signature-rgb), .15); border: 1px solid rgba(var(--signature-rgb), .20);
          color: var(--txt-pure); font: 800 9px/1 'JetBrains Mono', ui-monospace, monospace;
          transition: transform 180ms cubic-bezier(.2,.8,.2,1), border-color 120ms ease;
        }
        .team-filter-project-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .team-filter-project:hover .team-filter-project-logo { transform: scale(1.07); border-color: rgba(var(--signature-rgb), .42); }

        .team-filter-project-name {
          min-width: 0; max-width: 148px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font: 500 11px/1.3 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .2px; color: var(--txt-muted);
          transition: color 120ms ease;
        }
        .team-filter-project:hover .team-filter-project-name { color: var(--txt-pure); }

        .team-filter-project-status {
          display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto;
          font: 600 9px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .4px; text-transform: lowercase;
          color: var(--txt-faint);
        }
        .team-filter-project-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--txt-faint); }
        .team-filter-project-status[data-pulse='shipping']   { color: var(--success); }
        .team-filter-project-status[data-pulse='converging'] { color: var(--signature); }
        .team-filter-project-status[data-pulse='drifting']   { color: var(--signature); }
        .team-filter-project-status[data-pulse='stuck']      { color: var(--warning); }
        .team-filter-project-dot[data-pulse='shipping']   { background: var(--success); }
        .team-filter-project-dot[data-pulse='converging'] { background: var(--signature); }
        .team-filter-project-dot[data-pulse='drifting']   { background: var(--signature); }
        .team-filter-project-dot[data-pulse='stuck']      { background: var(--warning); }

        .team-filter-projhint {
          padding: 6px 16px 6px 42px; color: var(--txt-faint);
          font: 500 10px/1.3 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .3px; text-transform: lowercase;
        }

        @media (prefers-reduced-motion: reduce) {
          .team-filter-menu,
          .team-filter-projwrap,
          .team-filter-projwrap-inner,
          .team-filter-project-logo,
          .team-filter-chev { transition: none; animation: none; }
        }

        /* Footer — two equal mono links, hairline-split. */
        .team-filter-foot { display: flex; }
        .team-filter-footlink {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 13px 16px; font: 700 10px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 1px; text-transform: uppercase;
          color: var(--txt-faint); text-decoration: none; transition: background 120ms ease, color 120ms ease;
        }
        .team-filter-footlink + .team-filter-footlink { border-left: 1px solid var(--rule); }
        .team-filter-footlink:hover, .team-filter-footlink:focus-visible { outline: none !important; box-shadow: none !important; background: rgba(255,255,255,.04); color: var(--signature); }

        html.light .team-filter-menu { background: #ffffff; box-shadow: var(--shadow-deep), inset 0 1px 0 rgba(var(--signature-rgb), .12); }
        html.light .team-filter-allrow:hover,
        html.light .team-filter-teammain:hover,
        html.light .team-filter-project:hover,
        html.light .team-filter-footlink:hover { background: rgba(20,14,30,.04); }
        @media (max-width: 900px) { .team-filter-trigger { min-width: auto; max-width: 145px; } }
      `}</style>
    </div>
  );
}

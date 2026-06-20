'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useTeam } from './TeamProvider';

function Check({ active }: { active: boolean }) {
  return (
    <span className="team-filter-check" data-active={active ? 'true' : 'false'} aria-hidden="true">
      {active && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}

export default function TeamSwitcher() {
  const t = useTranslations('teams');
  const { teams, selectedTeamIds, setSelectedTeamIds } = useTeam();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (teams.length === 0) return null;

  const allSelected = selectedTeamIds.length === teams.length;
  const selectedTeams = teams.filter((team) => selectedTeamIds.includes(team.id));
  const triggerLabel = allSelected && teams.length > 1
    ? t('switcher.allTeams')
    : selectedTeams.length === 1
      ? selectedTeams[0].name
      : t('switcher.teamCount', { count: selectedTeams.length });

  const toggleTeam = (teamId: string) => {
    const active = selectedTeamIds.includes(teamId);
    if (active && selectedTeamIds.length === 1) return;
    setSelectedTeamIds(
      active
        ? selectedTeamIds.filter((id) => id !== teamId)
        : [...selectedTeamIds, teamId],
    );
  };

  return (
    <div ref={ref} className="team-filter-root">
      <button
        type="button"
        className="team-filter-trigger"
        onClick={() => setOpen((value) => !value)}
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
          <div className="team-filter-menu-head">
            <span className="team-filter-eyebrow">{t('switcher.teamFilter')}</span>
            <span className="team-filter-tally">{selectedTeamIds.length}/{teams.length}</span>
          </div>

          <div className="team-filter-options">
            {teams.length > 1 && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={allSelected}
                className="team-filter-row team-filter-all"
                data-active={allSelected ? 'true' : 'false'}
                onClick={() => setSelectedTeamIds(teams.map((team) => team.id))}
              >
                <Check active={allSelected} />
                <span className="team-filter-row-copy">
                  <strong>{t('switcher.allTeams')}</strong>
                  <small>{t('switcher.allTeamsHint')}</small>
                </span>
              </button>
            )}

            {teams.map((team) => {
              const active = selectedTeamIds.includes(team.id);
              return (
                <button
                  key={team.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className="team-filter-row"
                  data-active={active ? 'true' : 'false'}
                  onClick={() => toggleTeam(team.id)}
                >
                  <Check active={active} />
                  <span className="team-filter-avatar">{team.name.slice(0, 1).toUpperCase()}</span>
                  <span className="team-filter-name">{team.name}</span>
                  <span className="team-filter-role">{t(`roles.${team.role}`)}</span>
                </button>
              );
            })}
          </div>

          <Link href="/teams" className="team-filter-manage" onClick={() => setOpen(false)}>
            {t('switcher.manageTeams')}
          </Link>
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

        /* Solid, opaque panel — no var(--bg-card) dependency, no page bleed-through.
           Dark base = opaque form of --modal-bg (rgb 24,24,27); light overridden below.
           Single glass surface only (no stacked blur) per the design system. */
        .team-filter-menu {
          position: absolute; top: calc(100% + 9px); right: 0; width: 288px; overflow: hidden; z-index: 1000;
          background: #18181b; border: 1px solid var(--rule-strong); border-radius: 13px;
          box-shadow: var(--shadow-deep), inset 0 1px 0 rgba(var(--signature-rgb), .16);
          animation: teamFilterIn 150ms cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes teamFilterIn { from { opacity: 0; transform: translateY(-5px) scale(.985); } }

        /* Header — terse mono recgon-label + tally, no marketing heading. */
        .team-filter-menu-head {
          padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--rule);
        }
        .team-filter-eyebrow {
          color: var(--signature); font: 700 10px/1 'JetBrains Mono', monospace;
          letter-spacing: 1.2px; text-transform: uppercase; opacity: .85;
        }
        .team-filter-eyebrow::before { content: '// '; opacity: .5; }
        .team-filter-tally { color: var(--txt-faint); font: 600 10px/1 'JetBrains Mono', monospace; }

        .team-filter-options { max-height: 330px; overflow-y: auto; padding: 6px; }

        /* Rows — flat list items, not chip-cards. Selection + hover read through the
           signature left-edge bar (the same device globals use for nav/team-row hover). */
        .team-filter-row {
          position: relative; width: 100%; min-height: 42px; padding: 7px 10px; border: 0; border-radius: 8px;
          background: transparent; color: var(--txt-pure); display: flex; align-items: center; gap: 10px;
          cursor: pointer; text-align: left;
          transition: background 130ms ease, transform 130ms cubic-bezier(.16,1,.3,1), box-shadow 130ms ease;
        }
        .team-filter-row[data-active='true'] {
          background: rgba(var(--signature-rgb), .08);
          box-shadow: inset 2px 0 0 var(--signature);
        }
        .team-filter-row:hover {
          background: rgba(var(--signature-rgb), .12);
          box-shadow: inset 2px 0 0 var(--signature);
          transform: translateX(2px);
        }
        .team-filter-check {
          width: 16px; height: 16px; border: 1.5px solid var(--rule-strong); border-radius: 5px;
          display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
          color: var(--signature-ink); transition: background 130ms ease, border-color 130ms ease;
        }
        .team-filter-check[data-active='true'] { background: var(--signature); border-color: var(--signature); box-shadow: 0 0 10px rgba(var(--signature-rgb), .35); }
        .team-filter-avatar {
          width: 22px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
          background: rgba(255,255,255,.06); color: var(--txt-muted);
          font: 700 9.5px/1 'JetBrains Mono', monospace; letter-spacing: .3px; transition: background 130ms ease, color 130ms ease;
        }
        .team-filter-row[data-active='true'] .team-filter-avatar { background: rgba(var(--signature-rgb), .16); color: var(--signature); }
        .team-filter-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
        .team-filter-role { color: var(--txt-faint); font: 600 9px/1 'JetBrains Mono', monospace; text-transform: lowercase; letter-spacing: .4px; }
        .team-filter-all { min-height: 48px; margin-bottom: 2px; }
        .team-filter-row-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
        .team-filter-row-copy strong { font-size: 12px; font-weight: 600; }
        .team-filter-row-copy small { color: var(--txt-faint); font-size: 10px; }

        /* Footer action — top hairline, signature hover + left-bar, no "↗". */
        .team-filter-manage {
          display: flex; align-items: center; padding: 11px 16px; border-top: 1px solid var(--rule);
          color: var(--txt-muted); font-size: 12px; font-weight: 600; text-decoration: none;
          transition: background 130ms ease, color 130ms ease, box-shadow 130ms ease;
        }
        .team-filter-manage:hover { background: rgba(var(--signature-rgb), .08); color: var(--signature); box-shadow: inset 2px 0 0 var(--signature); }

        html.light .team-filter-menu { background: #ffffff; box-shadow: var(--shadow-deep), inset 0 1px 0 rgba(var(--signature-rgb), .12); }
        html.light .team-filter-avatar { background: rgba(20,14,30,.05); }
        html.light .team-filter-row:hover { background: rgba(var(--signature-rgb), .10); }
        @media (max-width: 900px) { .team-filter-trigger { min-width: auto; max-width: 145px; } }
      `}</style>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useTeam } from './TeamProvider';
import { TeammateAvatar } from '@/components/v2/TeammateAvatar';

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
                <span className="team-filter-allglyph" data-active={allSelected ? 'true' : 'false'} aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                <span className="team-filter-identity">
                  <span className="team-filter-name">{t('switcher.allTeams')}</span>
                  <span className="team-filter-role">{t('switcher.teamCount', { count: teams.length })}</span>
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
                  <TeammateAvatar name={team.name} size={26} isIdle={!active} />
                  <span className="team-filter-identity">
                    <span className="team-filter-name">{team.name}</span>
                    <span className="team-filter-role">{t(`roles.${team.role}`)}</span>
                  </span>
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

        .team-filter-options { max-height: 340px; overflow-y: auto; padding: 6px; }

        /* Rows are built from the SAME parts as the calendar swimlane: the shared
           TeammateAvatar circle + stacked MONO name / MONO role. Selection reads
           through the avatar (idle-dim when off) + the signature left-edge bar.
           No checkbox, no boxed chip, and the browser focus-ring is replaced by the
           same left-bar so a clicked row never gets the pink outline box. */
        .team-filter-row {
          position: relative; width: 100%; min-height: 44px; padding: 7px 10px; border: 0; border-radius: 7px;
          background: transparent; color: var(--txt-pure); display: flex; align-items: center; gap: 11px;
          cursor: pointer; text-align: left;
          transition: background 130ms ease, transform 130ms cubic-bezier(.16,1,.3,1), box-shadow 130ms ease;
        }
        .team-filter-row[data-active='true'] { background: rgba(var(--signature-rgb), .07); box-shadow: inset 2px 0 0 var(--signature); }
        .team-filter-row:hover { background: rgba(var(--signature-rgb), .11); box-shadow: inset 2px 0 0 var(--signature); transform: translateX(2px); }
        .team-filter-row:focus-visible { outline: none !important; box-shadow: inset 2px 0 0 var(--signature) !important; background: rgba(var(--signature-rgb), .11); }

        .team-filter-identity { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
        .team-filter-name {
          font: 700 11px/1.2 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .6px; text-transform: uppercase;
          color: var(--txt-pure); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .team-filter-role {
          font: 400 9.5px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .8px; text-transform: uppercase;
          color: var(--txt-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* All-teams aggregate marker — circle to match the avatars, signature when active. */
        .team-filter-allglyph {
          width: 26px; height: 26px; border-radius: 50%; flex: 0 0 auto;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--rule-strong); color: var(--txt-faint);
          transition: color 130ms ease, border-color 130ms ease, background 130ms ease;
        }
        .team-filter-row[data-active='true'] .team-filter-allglyph {
          color: var(--signature); border-color: rgba(var(--signature-rgb), .5); background: rgba(var(--signature-rgb), .12);
        }
        .team-filter-all { margin-bottom: 2px; }

        /* Footer — mono uppercase like the nav links, signature hover + left-bar, no arrow. */
        .team-filter-manage {
          display: flex; align-items: center; padding: 12px 16px; border-top: 1px solid var(--rule);
          font: 700 10px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 1px; text-transform: uppercase;
          color: var(--txt-faint); text-decoration: none;
          transition: background 130ms ease, color 130ms ease, box-shadow 130ms ease;
        }
        .team-filter-manage:hover, .team-filter-manage:focus-visible {
          outline: none !important; background: rgba(var(--signature-rgb), .08);
          color: var(--signature); box-shadow: inset 2px 0 0 var(--signature) !important;
        }

        html.light .team-filter-menu { background: #ffffff; box-shadow: var(--shadow-deep), inset 0 1px 0 rgba(var(--signature-rgb), .12); }
        html.light .team-filter-row:hover { background: rgba(var(--signature-rgb), .09); }
        @media (max-width: 900px) { .team-filter-trigger { min-width: auto; max-width: 145px; } }
      `}</style>
    </div>
  );
}

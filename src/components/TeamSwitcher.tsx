'use client';

import { useState, useRef, useEffect } from 'react';
import { useTeam } from './TeamProvider';
import Link from 'next/link';

export default function TeamSwitcher() {
  const { teams, currentTeam, setCurrentTeam } = useTeam();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!currentTeam) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="team-switcher-trigger"
        onClick={() => setOpen(!open)}
        style={{
          padding: '7px 14px',
          background: 'var(--glass-substrate)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          color: 'var(--txt)',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          boxShadow: open ? '0 0 0 2px var(--accent-faint)' : 'none',
        }}
      >
        {/* Team icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} style={{ flexShrink: 0 }}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span title={currentTeam.name} style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '140px',
        }}>
          {currentTeam.name}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2}
          style={{
            flexShrink: 0,
            opacity: 0.5,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="team-switcher-menu" style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          minWidth: '220px',
          marginTop: '6px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>
          <div className="team-switcher-section-label" style={{
            padding: '8px 12px 4px',
            fontSize: '0.65rem',
            fontWeight: 600,
            color: 'var(--txt-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Teams
          </div>
          {teams.map((team) => (
            <button
              key={team.id}
              className="team-switcher-team-row"
              onClick={() => {
                setCurrentTeam(team);
                setOpen(false);
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: team.id === currentTeam.id ? 'var(--accent-faint)' : 'transparent',
                border: 'none',
                color: 'var(--txt)',
                fontSize: '0.8rem',
                fontWeight: team.id === currentTeam.id ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                transition: 'background 0.15s',
              }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflow: 'hidden',
              }}>
                {team.id === currentTeam.id && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={3} style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {team.name}
                </span>
              </span>
              <span style={{
                fontSize: '0.65rem',
                color: 'var(--txt-muted)',
                flexShrink: 0,
                padding: '2px 6px',
                background: 'var(--glass-substrate)',
                borderRadius: '4px',
              }}>
                {team.role}
              </span>
            </button>
          ))}
          <Link
            href="/teams"
            className="team-switcher-manage-link"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '9px 12px',
              borderTop: '1px solid var(--border)',
              color: 'var(--accent)',
              fontSize: '0.75rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Manage Teams
          </Link>
        </div>
      )}
    </div>
  );
}

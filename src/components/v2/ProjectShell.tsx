'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTeam } from '@/components/TeamProvider';

interface Tab {
  key: string;
  href: (id: string) => string;
  isActive: (path: string, id: string) => boolean;
  ownerOnly?: boolean;
}

const TABS: Tab[] = [
  {
    key: 'overview',
    href: (id) => `/projects/${id}`,
    isActive: (path, id) => path === `/projects/${id}`,
  },
  {
    key: 'tasks',
    href: (id) => `/projects/${id}/tasks`,
    isActive: (path, id) => path.startsWith(`/projects/${id}/tasks`),
    ownerOnly: true,
  },
  {
    key: 'analytics',
    href: (id) => `/projects/${id}/analytics`,
    isActive: (path, id) => path.startsWith(`/projects/${id}/analytics`),
  },
  {
    key: 'marketing',
    href: (id) => `/projects/${id}/marketing`,
    isActive: (path, id) => path.startsWith(`/projects/${id}/marketing`),
  },
  {
    key: 'settings',
    href: (id) => `/projects/${id}/settings`,
    isActive: (path, id) => path.startsWith(`/projects/${id}/settings`),
  },
];

interface Props { projectId: string }

export default function ProjectShell({ projectId }: Props) {
  const pathname = usePathname();
  const t = useTranslations('projects');
  const ctx = useTeam();
  const projects = useMemo(() => ctx.projects ?? [], [ctx.projects]);
  const role = ctx.currentTeam?.role;

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  // Owner-only tabs (the project task board) stay hidden from members + viewers.
  // Until the team context settles we show every tab so owners don't see a flash
  // of the locked nav on first paint.
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || !role || role === 'owner');

  return (
    <div className="v2-pshell">
      <div className="v2-pshell-crumbs">
        <Link href="/projects" className="v2-pshell-crumb">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('shell.crumb')}
        </Link>
      </div>

      <nav className="v2-pshell-tabs" aria-label={t('shell.tabsAria')}>
        {visibleTabs.map((tab) => {
          const active = tab.isActive(pathname, projectId);
          return (
            <Link
              key={tab.key}
              href={tab.href(projectId)}
              className={`v2-pshell-tab ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {t(`shell.tabs.${tab.key}`)}
            </Link>
          );
        })}
      </nav>

      <style>{`
        .v2-pshell {
          margin-bottom: 28px;
          animation: v2shellFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2shellFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        .v2-pshell-crumbs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .v2-pshell-crumb {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--txt-faint);
          text-decoration: none;
          transition: color 200ms ease, gap 200ms ease;
        }
        .v2-pshell-crumb:hover {
          color: var(--signature);
          gap: 8px;
        }
        .v2-pshell-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--rule, rgba(255,255,255,0.08));
          overflow-x: auto;
          scrollbar-width: none;
        }
        .v2-pshell-tabs::-webkit-scrollbar { display: none; }
        .v2-pshell-tab {
          position: relative;
          padding: 10px 16px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--txt-faint);
          text-decoration: none;
          white-space: nowrap;
          transition: color 200ms ease;
        }
        .v2-pshell-tab:hover { color: var(--txt-muted); }
        .v2-pshell-tab.is-active { color: var(--txt-pure); }
        .v2-pshell-tab.is-active::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -3px;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--signature);
          transform: translateX(-50%);
          box-shadow: 0 0 8px var(--signature);
          animation: v2tabDot 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes v2tabDot {
          0%   { transform: translateX(-50%) scale(0); opacity: 0; }
          60%  { transform: translateX(-50%) scale(1.4); opacity: 1; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

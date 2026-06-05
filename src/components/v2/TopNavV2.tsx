'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import RecgonLogo from '@/components/RecgonLogo';
import TeamSwitcher from '@/components/TeamSwitcher';
import AvatarMenu from '@/components/v2/AvatarMenu';

type NavItem = { href: string; key: string; matchPrefix?: boolean };

const NAV: NavItem[] = [
  { href: '/', key: 'home' },
  { href: '/projects', key: 'projects', matchPrefix: true },
  { href: '/tasks', key: 'tasks', matchPrefix: true },
  { href: '/calendar', key: 'calendar', matchPrefix: true },
  { href: '/terminal', key: 'terminal', matchPrefix: true },
];

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

const TASKS_SEEN_KEY = 'v2:tasks:lastSeenAt';

export default function TopNavV2() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const t = useTranslations('nav');
  const ts = useTranslations('shared');
  const [hasNewTask, setHasNewTask] = useState(false);
  const [mac, setMac] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => setMac(isMac()), []);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Show the dot only when there's a pending task assigned AFTER the last
  // time the user opened /tasks. The tasks page writes
  // localStorage.v2:tasks:lastSeenAt on mount.
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/inbox/count');
        if (cancelled) return;
        if (!r.ok) return;
        const { count, latestAt } = (await r.json()) as { count: number; latestAt: string | null };
        if (!latestAt || (count ?? 0) === 0) {
          setHasNewTask(false);
          return;
        }
        const seen = typeof window !== 'undefined' ? window.localStorage.getItem(TASKS_SEEN_KEY) : null;
        const isNew = !seen || new Date(latestAt).getTime() > new Date(seen).getTime();
        setHasNewTask(isNew);
      } catch {
        /* swallowed */
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    // Re-check when this tab regains focus or the tasks page writes the
    // seen-marker via a custom event.
    const onSeen = () => setHasNewTask(false);
    window.addEventListener('focus', tick);
    window.addEventListener('v2:tasks-seen', onSeen);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', tick);
      window.removeEventListener('v2:tasks-seen', onSeen);
    };
  }, [session?.user?.id]);

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent('v2:open-command'));
  };

  return (
    <>
      <header className="v2-topnav">
        <div className="v2-topnav-inner">
          <div className="v2-topnav-left">
            <Link href="/" className="v2-brand" aria-label={ts('nav.recgonHome')}>
              <RecgonLogo size={28} uid="logo-v2" />
            </Link>

            <span className="v2-topnav-rule" aria-hidden="true" />

            <nav className="v2-primary-nav" aria-label={ts('nav.primaryAria')}>
              {NAV.map((item) => {
                const active = item.matchPrefix
                  ? pathname === item.href || pathname.startsWith(item.href + '/')
                  : pathname === item.href;
                const showBadge = item.href === '/tasks' && hasNewTask;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`v2-nav-link ${active ? 'is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="v2-nav-label">{t(item.key)}</span>
                    {showBadge && (
                      <span className="v2-nav-badge-dot" aria-label={ts('nav.newTask')} />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="v2-topnav-right">
            {now && (
              <div className="v2-clock" title={ts('nav.localTime')} aria-label={ts('nav.currentTime', { time: formatTime(now) })}>
                {formatTime(now)}
              </div>
            )}

            <button
              type="button"
              className="v2-cmdk-trigger"
              onClick={openPalette}
              aria-label={ts('nav.openCommandPalette')}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="v2-cmdk-text">{ts('nav.searchPlaceholder')}</span>
              <span className="v2-cmdk-shortcut">{mac ? '⌘K' : 'Ctrl K'}</span>
            </button>

            {session?.user && <TeamSwitcher />}
            {session?.user && <AvatarMenu />}
          </div>
        </div>
      </header>

      <style>{`
        .v2-topnav {
          position: fixed;
          top: 14px;
          /* Mock: centered floating pill with a max-width cap (1400px)
             so on wide displays the bar floats with margin on both sides
             instead of stretching edge-to-edge. Brings the marketing-
             page floating-pill aesthetic into the product without
             splitting the dense content into two groups. */
          left: 50%;
          width: calc(100% - 32px);
          max-width: 1400px;
          z-index: 200;
          /* v1 liquid-glass treatment: heavy blur + saturate, semi-transparent
             substrate, layered float/edge shadows. Floats off the top edge
             with pill-rounded corners so it reads as a detached surface. */
          background: var(--nav-glass-substrate);
          backdrop-filter: blur(48px) saturate(180%);
          -webkit-backdrop-filter: blur(48px) saturate(180%);
          border-radius: 999px;
          box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
          isolation: isolate;
          transform: translateX(-50%) translate3d(0,0,0);
          backface-visibility: hidden;
        }
        .v2-topnav-inner {
          /* Inner padding is intentionally pulled in from the pill edges so
             the logo and avatar don't crowd the rounded corners. */
          margin: 0;
          padding: 0 28px 0 32px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        @media (max-width: 1280px) {
          .v2-topnav-inner { padding: 0 24px 0 28px; }
        }
        .v2-topnav-left {
          display: flex;
          align-items: center;
          gap: 22px;
          min-width: 0;
        }
        .v2-topnav-rule {
          width: 1px;
          height: 18px;
          background: var(--rule, rgba(255,255,255,0.10));
        }
        .v2-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: var(--txt-pure);
          transition:
            color 0.18s ease,
            transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
            filter 0.18s ease;
        }
        .v2-brand:hover {
          color: var(--signature);
          transform: translateY(-1px) scale(1.04) translateZ(0);
          filter: drop-shadow(0 0 10px rgba(var(--signature-rgb), 0.34));
        }
        .v2-brand-text {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .v2-brand-tag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--signature);
          padding: 2px 7px;
          border: 1px solid rgba(var(--signature-rgb), 0.30);
          border-radius: 999px;
          background: transparent;
        }
        .v2-primary-nav {
          display: flex;
          align-items: center;
          gap: 0;
        }
        .v2-nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--txt-faint);
          text-decoration: none;
          transition: color 200ms ease;
        }
        .v2-nav-link:hover { color: var(--txt-muted); }
        .v2-nav-link.is-active { color: var(--txt-pure); }
        .v2-nav-link.is-active::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -3px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--signature);
          transform: translateX(-50%);
          box-shadow: 0 0 8px var(--signature);
          animation: v2navDot 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes v2navDot {
          0%   { transform: translateX(-50%) scale(0); opacity: 0; }
          60%  { transform: translateX(-50%) scale(1.4); opacity: 1; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        .v2-nav-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--signature);
          box-shadow: 0 0 6px var(--signature);
          animation: v2navDotPulse 1.8s ease-in-out infinite;
        }
        @keyframes v2navDotPulse {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 4px var(--signature); }
          50%      { opacity: 1;   box-shadow: 0 0 10px var(--signature), 0 0 16px var(--signature); }
        }
        .v2-topnav-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .v2-cmdk-trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px 7px 12px;
          background: transparent;
          border: 1px solid var(--rule, rgba(255,255,255,0.10));
          border-radius: 8px;
          color: var(--txt-faint);
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          min-width: 240px;
          transition: border-color 200ms ease, color 200ms ease, background 200ms ease;
        }
        .v2-cmdk-trigger:hover {
          color: var(--txt-muted);
          border-color: rgba(var(--signature-rgb), 0.35);
          background: rgba(var(--signature-rgb), 0.03);
        }
        .v2-cmdk-text { flex: 1; text-align: left; }
        .v2-cmdk-shortcut {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.4px;
          color: var(--txt-faint);
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--rule, rgba(255,255,255,0.08));
          border-radius: 4px;
          padding: 1px 5px;
        }
        .v2-clock {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--txt-faint);
          letter-spacing: 0.4px;
          font-variant-numeric: tabular-nums;
          padding: 0 2px;
        }
        @media (max-width: 1024px) {
          .v2-cmdk-text { display: none; }
          .v2-cmdk-trigger { min-width: 0; padding: 7px 10px; }
          .v2-clock { display: none; }
        }
        @media (max-width: 720px) {
          .v2-topnav { top: 10px; left: 10px; right: 10px; border-radius: 28px; }
          .v2-topnav-inner { padding: 0 18px; gap: 10px; }
          .v2-primary-nav { gap: 0; }
          .v2-nav-link { padding: 8px 6px; font-size: 10px; letter-spacing: 0.5px; }
          .v2-brand-text, .v2-brand-tag { display: none; }
          .v2-topnav-rule { display: none; }
        }
        @media (max-width: 640px) {
          /* Drop the command-palette trigger entirely — desktop power-user tool.
             Nav + team switcher + avatar are the essentials on mobile. */
          .v2-cmdk-trigger { display: none; }
          .v2-topnav-inner { gap: 8px; padding: 0 14px; }
          .v2-topnav-right { gap: 6px; }
          .v2-topnav-left { gap: 12px; }
          .v2-nav-link { padding: 8px 5px; font-size: 9.5px; letter-spacing: 0.4px; }
        }
      `}</style>
    </>
  );
}

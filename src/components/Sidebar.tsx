'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import RecgonLogo from './RecgonLogo';
import TeamSwitcher from './TeamSwitcher';

const NAV_ITEMS = [
  {
    href: '/mentor',
    label: 'Terminal',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
  },
  {
    href: '/projects',
    label: 'Projects',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  },
  {
    href: '/marketing',
    label: 'Marketing',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2" width="20" height="13" rx="2"/><line x1="11" y1="15" x2="11" y2="22"/><line x1="6" y1="22" x2="16" y2="22"/><path d="M22 6h1m0 4h-1"/></svg>
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  },
  {
    href: '/',
    label: 'Overview',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  },
  {
    href: '/feedback',
    label: 'Feedback',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  },
  {
    href: '/inbox',
    label: 'Tasks',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>
  },
  {
    href: '/teams',
    label: 'Teams',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const { data: session } = useSession();
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);

  // Poll inbox count so the badge updates as Recgon assigns work.
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/inbox/count');
        if (cancelled) return;
        if (r.ok) {
          const { count } = await r.json();
          setInboxCount(count ?? 0);
        }
      } catch {
        /* swallowed */
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session?.user?.id]);

  // If the JWT doesn't have avatarUrl (e.g. stale token), fetch it from the DB once
  useEffect(() => {
    if (!session?.user) return;
    if ((session.user as { avatarUrl?: string }).avatarUrl) return;
    fetch('/api/account')
      .then((r) => r.json())
      .then((d) => { if (d.avatarUrl) setFetchedAvatarUrl(d.avatarUrl); })
      .catch(() => {});
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMounted(true);
    // Create the persistent overlay element once
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      pointer-events: none; opacity: 0;
      will-change: opacity;
      transform: translate3d(0,0,0);
      backface-visibility: hidden;
    `;
    document.body.appendChild(overlay);
    overlayRef.current = overlay;
    return () => { overlay.remove(); };
  }, []);

  const handleThemeToggle = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';

    // Prefer the native View Transitions API when available (Chromium/Safari 18+).
    // Animation is driven by ::view-transition-old(root) / ::view-transition-new(root)
    // rules in globals.css, which already use the signature easing.
    type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
    const docVT = document as DocVT;
    if (typeof docVT.startViewTransition === 'function') {
      docVT.startViewTransition(() => setTheme(newTheme));
      return;
    }

    // Fallback: opacity-overlay trick for browsers without the VT API.
    const overlay = overlayRef.current;
    if (!overlay) {
      setTheme(newTheme);
      return;
    }

    const currentBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim();
    overlay.style.background = currentBg;
    overlay.style.transition = 'none';
    overlay.style.opacity = '1';
    overlay.offsetHeight; // force layout
    setTheme(newTheme);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity var(--dur-base) var(--ease-out)';
        overlay.style.opacity = '0';
      });
    });
  }, [theme, setTheme]);

  return (
    <>
      <a href="/" className="brand-logo" style={{ cursor: 'pointer', textDecoration: 'none' }}>
        <RecgonLogo size={42} uid="logo-sidebar" />
      </a>

      <nav className="top-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = (item.href === '/' || item.href === '/mentor')
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const showBadge = item.href === '/inbox' && inboxCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? 'active' : ''}`}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              style={isActive ? { viewTransitionName: 'nav-active-pill' } as React.CSSProperties : undefined}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                {item.icon}
                {showBadge && (
                  <span
                    aria-label={`${inboxCount} pending`}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 8,
                      background: 'var(--signature)',
                      color: 'white',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      lineHeight: '16px',
                      textAlign: 'center',
                      boxShadow: '0 0 0 2px var(--bg-deep, #000)',
                    }}
                  >
                    {inboxCount > 99 ? '99+' : inboxCount}
                  </span>
                )}
              </span>
              <span className="nav-link-label">{item.label}</span>
            </Link>
          );
        })}
        {mounted && (
          <button
            className="theme-toggle"
            onClick={handleThemeToggle}
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg className="theme-icon theme-icon-sun" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="4" />
                <g className="sun-rays" strokeLinecap="round">
                  <line x1="12" y1="2.5" x2="12" y2="4.5" />
                  <line x1="12" y1="19.5" x2="12" y2="21.5" />
                  <line x1="2.5" y1="12" x2="4.5" y2="12" />
                  <line x1="19.5" y1="12" x2="21.5" y2="12" />
                  <line x1="5.2" y1="5.2" x2="6.6" y2="6.6" />
                  <line x1="17.4" y1="17.4" x2="18.8" y2="18.8" />
                  <line x1="5.2" y1="18.8" x2="6.6" y2="17.4" />
                  <line x1="17.4" y1="6.6" x2="18.8" y2="5.2" />
                </g>
              </svg>
            ) : (
              <svg className="theme-icon theme-icon-moon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        )}

      </nav>

      {session?.user && (
        <div className="account-pill-group" style={{
          position: 'fixed', top: '32px', right: '48px',
          display: 'flex', alignItems: 'center', gap: '12px',
          zIndex: 100,
        }}>
          <TeamSwitcher />
          <Link href="/account" className="account-avatar-link" title={session.user.nickname || session.user.email || 'Account'} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px',
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid var(--border)',
            background: 'var(--accent-faint)',
            textDecoration: 'none',
            flexShrink: 0,
            transition: 'border-color 0.2s',
          }}>
            {((session.user as { avatarUrl?: string }).avatarUrl || fetchedAvatarUrl) ? (
              <img
                src={((session.user as { avatarUrl?: string }).avatarUrl || fetchedAvatarUrl)!}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--accent)',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}>
                {(session.user.nickname || session.user.email || '?').slice(0, 2)}
              </span>
            )}
          </Link>
        </div>
      )}
    </>
  );
}

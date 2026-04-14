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
    href: '/', 
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
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><circle cx="12" cy="12" r="3"/></svg>
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  },
  {
    href: '/feedback',
    label: 'Feedback',
    icon: <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const { data: session } = useSession();
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState<string | null>(null);

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
    const overlay = overlayRef.current;
    
    if (!overlay) {
      setTheme(newTheme);
      return;
    }

    // Get the current background color to use as the overlay
    const currentBg = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim();
    overlay.style.background = currentBg;
    
    // Snap overlay to fully visible (blocks the old look)
    overlay.style.transition = 'none';
    overlay.style.opacity = '1';
    
    // Force a synchronous layout so the browser renders the overlay at opacity:1
    overlay.offsetHeight;
    
    // Switch theme instantly underneath the overlay
    setTheme(newTheme);
    
    // Next frame: fade the overlay out — this is ONE property (opacity) on ONE element = pure GPU compositor = 120fps
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        overlay.style.opacity = '0';
      });
    });
  }, [theme, setTheme]);

  return (
    <>
      <a href="/" className="brand-logo" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
        <RecgonLogo size={42} uid="logo-sidebar" />
      </a>

      <nav className="top-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive ? 'active' : ''}`}>
              {item.icon}
              {item.label}
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
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
          </button>
        )}

      </nav>

      {session?.user && (
        <div style={{
          position: 'fixed', top: '32px', right: '48px',
          display: 'flex', alignItems: 'center', gap: '12px',
          zIndex: 100,
        }}>
          <TeamSwitcher />
          <Link href="/account" title={session.user.nickname || session.user.email || 'Account'} style={{
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

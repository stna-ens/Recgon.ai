'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import RecgonLogo from '@/components/RecgonLogo';

const SECTIONS = [
  { href: '#how-it-works', label: 'How' },
  { href: '#capabilities', label: 'What' },
  { href: '#terminal', label: 'Terminal' },
  { href: '#faq', label: 'FAQ' },
];

export default function LandingNav() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light';

  return (
    <>
      <header className="lnd-nav" aria-label="Primary">
        <div className="lnd-nav-inner">
          <div className="lnd-nav-left">
            <Link href="/landing" className="lnd-brand" aria-label="Recgon home">
              <RecgonLogo size={26} uid="lnd-logo" />
            </Link>
            <span className="lnd-rule" aria-hidden="true" />
            <nav className="lnd-links">
              {SECTIONS.map((s) => (
                <a key={s.href} href={s.href} className="lnd-link">
                  {s.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="lnd-nav-right">
            <button
              type="button"
              className="lnd-theme"
              onClick={() => setTheme(current === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle color theme"
            >
              {mounted && current === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <Link href="/login" className="lnd-login">Sign in</Link>
            <Link href="/register" className="lnd-cta">Get started</Link>
          </div>
        </div>
      </header>

      <style>{`
        .lnd-nav {
          position: fixed;
          top: 14px; left: 16px; right: 16px;
          z-index: 200;
          background: var(--nav-glass-substrate);
          backdrop-filter: blur(48px) saturate(180%);
          -webkit-backdrop-filter: blur(48px) saturate(180%);
          border-radius: 999px;
          box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
          isolation: isolate;
          transform: translate3d(0,0,0);
        }
        .lnd-nav-inner {
          height: 60px;
          padding: 0 18px 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .lnd-nav-left { display: flex; align-items: center; gap: 22px; min-width: 0; }
        .lnd-nav-right { display: flex; align-items: center; gap: 10px; }
        .lnd-rule { width: 1px; height: 18px; background: var(--rule, rgba(255,255,255,0.10)); }

        .lnd-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: var(--txt-pure);
          transition: color .18s var(--ease-out), transform .18s var(--ease-out), filter .18s ease;
        }
        .lnd-brand:hover {
          color: var(--signature);
          transform: translateY(-1px);
          filter: drop-shadow(0 0 10px rgba(var(--signature-rgb), 0.34));
        }
        .lnd-links { display: flex; align-items: center; gap: 0; }
        .lnd-link {
          padding: 8px 14px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--txt-faint);
          text-decoration: none;
          transition: color .2s ease;
        }
        .lnd-link:hover { color: var(--txt-pure); }

        .lnd-theme {
          width: 34px; height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--rule, rgba(255,255,255,0.10));
          border-radius: 999px;
          color: var(--txt-muted);
          cursor: pointer;
          transition: color .2s ease, border-color .2s ease, background .2s ease;
        }
        .lnd-theme:hover {
          color: var(--signature);
          border-color: rgba(var(--signature-rgb), 0.45);
          background: rgba(var(--signature-rgb), 0.05);
        }

        .lnd-login {
          padding: 8px 14px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-muted);
          text-decoration: none;
          transition: color .2s ease;
        }
        .lnd-login:hover { color: var(--txt-pure); }

        .lnd-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: 999px;
          background: var(--signature);
          color: white;
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: -0.005em;
          text-decoration: none;
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.5), 0 6px 18px -8px rgba(var(--signature-rgb), 0.6);
          transition: transform .2s var(--ease-out), box-shadow .2s ease;
        }
        .lnd-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.6), 0 14px 32px -10px rgba(var(--signature-rgb), 0.7);
        }

        @media (max-width: 820px) {
          .lnd-links { display: none; }
          .lnd-rule { display: none; }
          .lnd-login { display: none; }
        }
        @media (max-width: 480px) {
          .lnd-nav-inner { padding: 0 14px; gap: 10px; }
        }
      `}</style>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import HelpFeedbackModal from './HelpFeedbackModal';

export default function AvatarMenu() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const t = useTranslations('shared');
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!session?.user) return;
    if ((session.user as { avatarUrl?: string }).avatarUrl) return;
    fetch('/api/account')
      .then((r) => r.json())
      .then((d) => { if (d?.avatarUrl) setFetchedAvatarUrl(d.avatarUrl); })
      // Passive, decorative avatar fetch — on failure we silently fall back to
      // the initials avatar (rendered below when avatarUrl is absent). No toast.
      .catch(() => {});
  }, [session?.user]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      // The menu is portaled to body, so we have to check both refs.
      const insideTrigger = wrapRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  if (!session?.user) return null;

  const avatarUrl = (session.user as { avatarUrl?: string }).avatarUrl || fetchedAvatarUrl;
  const initials = (session.user.nickname || session.user.email || '?').slice(0, 2).toUpperCase();

  return (
    <div ref={wrapRef} className="v2-avatar-wrap">
      <button
        type="button"
        className="v2-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('avatarMenu.accountMenu')}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="v2-avatar-img" />
        ) : (
          <span className="v2-avatar-initials">{initials}</span>
        )}
      </button>

      {/* Render the menu via portal directly into document.body so it
          escapes the TopNav's transform/backdrop-filter clipping. Without
          this, Safari clips menu items that extend beyond the topnav pill. */}
      {open && mounted && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} className="v2-avatar-menu" role="menu">
          <div className="v2-avatar-meta">
            <div className="v2-avatar-name">{session.user.nickname || t('avatarMenu.fallbackName')}</div>
            <div className="v2-avatar-email">{session.user.email}</div>
          </div>

          <div className="v2-menu-section">
            <Link href="/teams/me" className="v2-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {t('avatarMenu.myProfile')}
            </Link>
            <Link href="/settings" className="v2-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {t('avatarMenu.settings')}
            </Link>
            <Link href="/team" className="v2-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {t('avatarMenu.teamAdmin')}
            </Link>
          </div>

          <div className="v2-menu-divider" />

          <div className="v2-menu-section">
            <button
              type="button"
              className="v2-menu-item"
              role="menuitemcheckbox"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2"    x2="12" y2="5"    />
                  <line x1="12" y1="19"   x2="12" y2="22"   />
                  <line x1="2"  y1="12"   x2="5"  y2="12"   />
                  <line x1="19" y1="12"   x2="22" y2="12"   />
                  <line x1="4.93"  y1="4.93"  x2="7.05"  y2="7.05"  />
                  <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" />
                  <line x1="19.07" y1="4.93"  x2="16.95" y2="7.05"  />
                  <line x1="7.05"  y1="16.95" x2="4.93"  y2="19.07" />
                </svg>
              ) : (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M20.354 15.354A9 9 0 018.646 3.646 9 9 0 0012 21a9 9 0 008.354-5.646z" />
                </svg>
              )}
              {theme === 'dark' ? t('avatarMenu.lightMode') : t('avatarMenu.darkMode')}
            </button>
            <button
              type="button"
              className="v2-menu-item v2-menu-item-quiet"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setFeedbackOpen(true);
              }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {t('avatarMenu.helpFeedback')}
            </button>
          </div>

          <div className="v2-menu-divider" />

          <div className="v2-menu-section">
            <button
              type="button"
              className="v2-menu-item v2-menu-item-danger"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t('avatarMenu.signOut')}
            </button>
          </div>
        </div>,
        document.body
      )}

      <HelpFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <style>{`
        .v2-avatar-wrap { position: relative; }
        .v2-avatar-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px; height: 32px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(var(--signature-rgb), 0.08);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          cursor: pointer;
          transition: border-color 160ms ease;
        }
        .v2-avatar-btn:hover { border-color: rgba(var(--signature-rgb), 0.45); }
        .v2-avatar-img { width: 100%; height: 100%; object-fit: cover; }
        .v2-avatar-initials {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          color: var(--signature);
          letter-spacing: 0.3px;
        }
        /* Anchored to viewport (not the topnav) to escape Safari's
           backdrop-filter/transform clipping. Top = nav top (14) + nav
           height (60) + 8px gap = 82px. Right = nav right gutter (16) +
           a touch more to sit under the avatar (~10) = 26px. */
        .v2-avatar-menu {
          position: fixed;
          right: 26px;
          top: 82px;
          width: 240px;
          padding: 6px;
          background: color-mix(in oklab, var(--bg-deep, #0a0a0c) 96%, transparent);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.10));
          border-radius: 10px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.2);
          z-index: 1000;
        }
        @media (max-width: 720px) {
          .v2-avatar-menu { right: 14px; top: 76px; }
        }
        .v2-avatar-meta {
          padding: 10px 10px 8px;
          border-bottom: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.06));
          margin-bottom: 4px;
        }
        .v2-avatar-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--txt-pure);
          margin-bottom: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-avatar-email {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-menu-section { display: flex; flex-direction: column; }
        .v2-menu-divider {
          height: 1px;
          background: var(--btn-secondary-border, rgba(255,255,255,0.06));
          margin: 4px 0;
        }
        .v2-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--txt-muted);
          text-decoration: none;
          text-align: left;
          cursor: pointer;
          width: 100%;
          transition: background 120ms ease, color 120ms ease;
        }
        .v2-menu-item:hover {
          background: rgba(var(--signature-rgb), 0.06);
          color: var(--txt-pure);
        }
        .v2-menu-item-quiet { color: var(--txt-faint); }
        .v2-menu-item-danger { color: var(--danger, #f87171); }
        .v2-menu-item-danger:hover {
          background: rgba(248, 113, 113, 0.08);
          color: var(--danger, #f87171);
        }
      `}</style>
    </div>
  );
}

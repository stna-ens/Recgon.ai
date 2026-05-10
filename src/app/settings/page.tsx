'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/Toast';

interface Account {
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  isWaitlistAdmin?: boolean;
}

interface GitHubStatus {
  connected: boolean;
  username: string | null;
}

interface WaitlistEntry {
  id: string;
  email: string;
  nickname: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  approvedAt: string | null;
  approvedByEmail: string | null;
  updatedAt: string;
}

const MCP_COMMAND = 'claude mcp add recgon --transport http https://recgon-ai.vercel.app/mcp';

type EditKey =
  | 'avatar'
  | 'nickname'
  | 'email'
  | 'password'
  | 'github'
  | 'mcp'
  | null;

const SECTIONS = [
  { id: 'sect-identity', index: '00', label: 'identity' },
  { id: 'sect-security', index: '01', label: 'security' },
  { id: 'sect-appearance', index: '02', label: 'appearance' },
  { id: 'sect-connections', index: '03', label: 'connections' },
  { id: 'sect-admin', index: '04', label: 'admin' },
  { id: 'sect-session', index: 'X', label: 'session' },
] as const;

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function V2SettingsPageInner() {
  const { data: session, update } = useSession();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<EditKey>(null);

  // Drafts
  const [nickDraft, setNickDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // Saving flags
  const [nickSaving, setNickSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [githubDisconnecting, setGithubDisconnecting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // MCP copy state
  const [mcpCopied, setMcpCopied] = useState(false);

  // Waitlist admin
  const [isWaitlistAdmin, setIsWaitlistAdmin] = useState(false);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistUpdating, setWaitlistUpdating] = useState<Record<string, boolean>>({});

  // Sign-out arming (mirrors destroy section)
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // TOC scroll-spy
  const [activeSection, setActiveSection] = useState<string>('sect-identity');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => setMounted(true), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [acctR, ghR] = await Promise.all([
        fetch('/api/account', { cache: 'no-store' }),
        fetch('/api/github/status', { cache: 'no-store' }),
      ]);
      if (acctR.ok) {
        const data = await acctR.json();
        setAccount(data);
        setIsWaitlistAdmin(!!data.isWaitlistAdmin);
      }
      if (ghR.ok) {
        const data = await ghR.json();
        setGithubStatus(data);
      }
    } catch { /* swallowed */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const github = searchParams?.get('github');
    if (github === 'connected') {
      setGithubStatus((s) => s ? { ...s, connected: true } : { connected: true, username: null });
      fetch('/api/github/status', { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setGithubStatus(d))
        .catch(() => null);
      addToast('github connected', 'success');
    }
  }, [searchParams, addToast]);

  // TOC scroll-spy — only observe sections that are actually rendered.
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, {
      rootMargin: '-30% 0px -50% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    SECTIONS.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading, isWaitlistAdmin]);

  const closeEditor = useCallback(() => setEditing(null), []);

  // ── Identity ────────────────────────────────────────
  const openNickname = useCallback(() => {
    setNickDraft(account?.nickname ?? '');
    setEditing('nickname');
  }, [account?.nickname]);

  const handleSaveNick = useCallback(async () => {
    const v = nickDraft.trim();
    if (!v || nickSaving) return;
    setNickSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'nickname', nickname: v }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      setAccount((p) => p ? { ...p, nickname: v } : p);
      await update({ nickname: v });
      closeEditor();
      addToast('nickname updated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setNickSaving(false);
    }
  }, [nickDraft, nickSaving, addToast, update, closeEditor]);

  const openEmail = useCallback(() => {
    setEmailDraft(account?.email ?? '');
    setEmailPassword('');
    setEditing('email');
  }, [account?.email]);

  const handleSaveEmail = useCallback(async () => {
    const v = emailDraft.trim();
    if (!v || !emailPassword || emailSaving) return;
    setEmailSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', newEmail: v, password: emailPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      setAccount((p) => p ? { ...p, email: v } : p);
      await update({ email: v });
      closeEditor();
      setEmailDraft('');
      setEmailPassword('');
      addToast('email updated. please sign in again.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setEmailSaving(false);
    }
  }, [emailDraft, emailPassword, emailSaving, addToast, update, closeEditor]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      addToast('image must be under 2MB', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/account/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      setAccount((p) => p ? { ...p, avatarUrl: data.avatarUrl ?? p.avatarUrl } : p);
      await update({ avatarUrl: data.avatarUrl });
      addToast('avatar updated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [addToast, update]);

  const handleAvatarRemove = useCallback(async () => {
    if (avatarUploading) return;
    setAvatarUploading(true);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'failed');
      }
      setAccount((p) => p ? { ...p, avatarUrl: null } : p);
      await update({ avatarUrl: '' });
      addToast('avatar removed', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUploading, addToast, update]);

  // ── Security ────────────────────────────────────────
  const openPassword = useCallback(() => {
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setEditing('password');
  }, []);

  const handleSavePassword = useCallback(async () => {
    if (!currentPwd || !newPwd || pwdSaving) return;
    if (newPwd.length < 8) {
      addToast('new password must be at least 8 characters', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      addToast('new passwords do not match', 'error');
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed');
      closeEditor();
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      addToast('password updated', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setPwdSaving(false);
    }
  }, [currentPwd, newPwd, confirmPwd, pwdSaving, addToast, closeEditor]);

  // ── Connections ─────────────────────────────────────
  const handleGithubDisconnect = useCallback(async () => {
    if (!confirm('Disconnect GitHub?')) return;
    setGithubDisconnecting(true);
    try {
      const res = await fetch('/api/github/connect', { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      setGithubStatus({ connected: false, username: null });
      addToast('github disconnected', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setGithubDisconnecting(false);
    }
  }, [addToast]);

  const handleMcpCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(MCP_COMMAND);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 2000);
    } catch {
      addToast('failed to copy', 'error');
    }
  }, [addToast]);

  // ── Waitlist ────────────────────────────────────────
  const loadWaitlist = useCallback(async () => {
    setWaitlistLoading(true);
    try {
      const res = await fetch('/api/admin/waitlist');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'failed to load waitlist');
      setWaitlistEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed to load waitlist', 'error');
    } finally {
      setWaitlistLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!isWaitlistAdmin) return;
    void loadWaitlist();
  }, [isWaitlistAdmin, loadWaitlist]);

  const updateWaitlistEntry = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    setWaitlistUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'failed to update waitlist');
      const updated = data.entry as WaitlistEntry;
      setWaitlistEntries((prev) => {
        const next = prev.map((entry) => (entry.id === updated.id ? updated : entry));
        return next.sort((a, b) => {
          if (a.status === b.status) {
            return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
          }
          const order: Record<WaitlistEntry['status'], number> = { pending: 0, approved: 1, rejected: 2 };
          return order[a.status] - order[b.status];
        });
      });
      addToast(
        status === 'approved' ? 'approved for registration' : 'removed from queue',
        'success'
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setWaitlistUpdating((prev) => ({ ...prev, [id]: false }));
    }
  }, [addToast]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    await signOut({ callbackUrl: '/login' });
  }, []);

  // Derived
  const pendingWaitlistEntries = useMemo(
    () => waitlistEntries.filter((e) => e.status === 'pending'),
    [waitlistEntries]
  );
  const approvedWaitlistEntries = useMemo(
    () => waitlistEntries.filter((e) => e.status === 'approved').slice(0, 8),
    [waitlistEntries]
  );

  const displayName = account?.nickname || (account?.email || session?.user?.email || 'You').split('@')[0];
  const displayEmail = account?.email || session?.user?.email || '';
  const initials = (account?.nickname || displayEmail || '?').slice(0, 2).toUpperCase();
  const avatarUrl = account?.avatarUrl;

  // Visible TOC sections (admin entry hidden when not admin)
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => s.id !== 'sect-admin' || isWaitlistAdmin),
    [isWaitlistAdmin]
  );

  return (
    <div className="v2-uset">
      <div className="v2-uset-grid" aria-hidden />

      {loading ? (
        <SpecSkeleton />
      ) : (
        <>
          <div className="v2-uset-band">
            <span className="recgon-label v2-uset-band-eye">settings · account</span>
            <span className="v2-uset-band-rule" aria-hidden />
            <span className="v2-uset-band-meta">
              <span>{displayEmail}</span>
            </span>
          </div>

          <div className="v2-uset-shell">
            <aside className="v2-uset-rail" aria-label="settings navigation">
              <div className="v2-uset-rail-stick">
                <div className="v2-uset-id">
                  <h1 className="v2-uset-name">{displayName}</h1>
                  {account?.email && (
                    <p className="v2-uset-tag-desc">{account.email}</p>
                  )}
                </div>

                <nav className="v2-uset-toc" aria-label="sections">
                  {visibleSections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(s.id);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          setActiveSection(s.id);
                        }
                      }}
                      className={`v2-uset-toc-item ${activeSection === s.id ? 'is-active' : ''} ${s.id === 'sect-session' ? 'is-danger' : ''}`}
                    >
                      <span className="v2-uset-toc-num">{s.index}</span>
                      <span className="v2-uset-toc-label">{s.label}</span>
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            <main className="v2-uset-spec">
              {/* SECTION 00 — IDENTITY */}
              <Section
                ref={(el) => { sectionRefs.current['sect-identity'] = el; }}
                id="sect-identity"
                index="00"
                label="identity"
                hint="How you show up in Recgon."
                stagger={0}
              >
                {/* Avatar */}
                <Field
                  label="avatar"
                  hint="Square image. JPEG, PNG, WebP, or GIF. Max 2MB."
                  open={false}
                  readOnly
                >
                  <div className="v2-uset-val v2-uset-val-row">
                    <div className="v2-uset-avatar">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                    <div className="v2-uset-avatar-actions">
                      <label className="v2-uset-tiny v2-uset-tiny-file">
                        {avatarUploading ? <><Spinner /> uploading</> : (avatarUrl ? 'change' : 'upload')}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleAvatarUpload}
                          disabled={avatarUploading}
                          hidden
                        />
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          className="v2-uset-tiny v2-uset-tiny-danger"
                          onClick={handleAvatarRemove}
                          disabled={avatarUploading}
                        >
                          remove
                        </button>
                      )}
                    </div>
                  </div>
                </Field>

                {/* Nickname */}
                <Field
                  label="nickname"
                  hint="Used in mentions and the avatar menu."
                  open={editing === 'nickname'}
                  onOpen={openNickname}
                  onCancel={closeEditor}
                >
                  {editing === 'nickname' ? (
                    <div className="v2-uset-edit">
                      <input
                        type="text"
                        value={nickDraft}
                        onChange={(e) => setNickDraft(e.target.value)}
                        className="v2-uset-input v2-uset-input-display"
                        placeholder="your nickname"
                        minLength={2}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveNick();
                          if (e.key === 'Escape') closeEditor();
                        }}
                      />
                      <FieldActions>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-uset-btn v2-uset-btn-ghost" onClick={closeEditor} disabled={nickSaving}>cancel</button>
                        <button type="button" className="v2-uset-btn v2-uset-btn-primary" onClick={handleSaveNick} disabled={nickSaving || !nickDraft.trim()}>
                          {nickSaving ? <><Spinner /> saving</> : 'save'}
                        </button>
                      </FieldActions>
                    </div>
                  ) : (
                    <p className="v2-uset-val v2-uset-val-display">
                      {account?.nickname || <Empty>no nickname yet</Empty>}
                    </p>
                  )}
                </Field>

                {/* Email */}
                <Field
                  label="email"
                  hint="Where we send invites, password resets, and notifications. Changing it signs you out."
                  open={editing === 'email'}
                  onOpen={openEmail}
                  onCancel={closeEditor}
                  actionLabel="change"
                >
                  {editing === 'email' ? (
                    <div className="v2-uset-edit">
                      <input
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder="new@example.com"
                        className="v2-uset-input"
                        autoFocus
                      />
                      <input
                        type="password"
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        placeholder="confirm with current password"
                        className="v2-uset-input"
                      />
                      <FieldActions>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-uset-btn v2-uset-btn-ghost" onClick={closeEditor} disabled={emailSaving}>cancel</button>
                        <button
                          type="button"
                          className="v2-uset-btn v2-uset-btn-primary"
                          onClick={handleSaveEmail}
                          disabled={emailSaving || !emailDraft.trim() || !emailPassword}
                        >
                          {emailSaving ? <><Spinner /> saving</> : 'save'}
                        </button>
                      </FieldActions>
                    </div>
                  ) : (
                    <code className="v2-uset-mono v2-uset-mono-lg">{displayEmail || '—'}</code>
                  )}
                </Field>
              </Section>

              {/* SECTION 01 — SECURITY */}
              <Section
                ref={(el) => { sectionRefs.current['sect-security'] = el; }}
                id="sect-security"
                index="01"
                label="security"
                hint="Your sign-in credentials."
                stagger={1}
              >
                <Field
                  label="password"
                  hint="Minimum 8 characters. Other sessions stay signed in."
                  open={editing === 'password'}
                  onOpen={openPassword}
                  onCancel={closeEditor}
                  actionLabel="change"
                >
                  {editing === 'password' ? (
                    <div className="v2-uset-edit">
                      <input
                        type="password"
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                        placeholder="current password"
                        className="v2-uset-input"
                        autoFocus
                      />
                      <input
                        type="password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        placeholder="new password (min 8 chars)"
                        className="v2-uset-input"
                        minLength={8}
                      />
                      <input
                        type="password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        placeholder="confirm new password"
                        className="v2-uset-input"
                      />
                      <FieldActions>
                        <span style={{ flex: 1 }} />
                        <button
                          type="button"
                          className="v2-uset-btn v2-uset-btn-ghost"
                          onClick={() => { closeEditor(); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                          disabled={pwdSaving}
                        >
                          cancel
                        </button>
                        <button
                          type="button"
                          className="v2-uset-btn v2-uset-btn-primary"
                          onClick={handleSavePassword}
                          disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}
                        >
                          {pwdSaving ? <><Spinner /> saving</> : 'update'}
                        </button>
                      </FieldActions>
                    </div>
                  ) : (
                    <p className="v2-uset-val">••••••••</p>
                  )}
                </Field>
              </Section>

              {/* SECTION 02 — APPEARANCE */}
              <Section
                ref={(el) => { sectionRefs.current['sect-appearance'] = el; }}
                id="sect-appearance"
                index="02"
                label="appearance"
                hint="How Recgon looks in this browser."
                stagger={2}
              >
                <Field
                  label="theme"
                  hint="Saved per browser. System theme is not auto-followed."
                  open={false}
                  readOnly
                >
                  <div role="radiogroup" aria-label="theme" className="v2-uset-toggle">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mounted ? theme === 'dark' : true}
                      className={`v2-uset-toggle-cell ${mounted && theme === 'dark' ? 'is-on' : ''}`}
                      onClick={() => setTheme('dark')}
                      disabled={!mounted}
                    >
                      <span className="v2-uset-toggle-dot" aria-hidden />
                      <span>dark</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mounted ? theme === 'light' : false}
                      className={`v2-uset-toggle-cell ${mounted && theme === 'light' ? 'is-on' : ''}`}
                      onClick={() => setTheme('light')}
                      disabled={!mounted}
                    >
                      <span className="v2-uset-toggle-dot" aria-hidden />
                      <span>light</span>
                    </button>
                  </div>
                </Field>
              </Section>

              {/* SECTION 03 — CONNECTIONS */}
              <Section
                ref={(el) => { sectionRefs.current['sect-connections'] = el; }}
                id="sect-connections"
                index="03"
                label="connections"
                hint="External tools wired into your account."
                stagger={3}
              >
                {/* GitHub */}
                <Field
                  label="github"
                  hint="Lets you import private repos and unlock code analysis."
                  open={false}
                  readOnly
                >
                  {githubStatus === null ? (
                    <p className="v2-uset-val v2-uset-val-empty">checking…</p>
                  ) : githubStatus.connected ? (
                    <div className="v2-uset-val v2-uset-val-stack">
                      <div className="v2-uset-anchor">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.43-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
                        </svg>
                        <code>{githubStatus.username ? `@${githubStatus.username}` : 'connected'}</code>
                      </div>
                      <div className="v2-uset-meta-row">
                        <span style={{ flex: 1 }} />
                        <button
                          type="button"
                          className="v2-uset-tiny v2-uset-tiny-danger"
                          onClick={handleGithubDisconnect}
                          disabled={githubDisconnecting}
                        >
                          {githubDisconnecting ? <><Spinner /> disconnecting</> : 'disconnect'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="v2-uset-val v2-uset-val-stack">
                      <p className="v2-uset-val-empty">No GitHub account linked. Public repos still work, but private imports need a connection.</p>
                      <a href="/api/github/connect" className="v2-uset-btn v2-uset-btn-ghost">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                        connect github
                      </a>
                    </div>
                  )}
                </Field>

                {/* Claude Code MCP */}
                <Field
                  label="claude code"
                  hint="MCP transport. Pipes Recgon insights into your editor."
                  open={false}
                  readOnly
                >
                  <div className="v2-uset-val v2-uset-val-stack">
                    <code className="v2-uset-mcp-code">{MCP_COMMAND}</code>
                    <div className="v2-uset-meta-row">
                      <span className="v2-uset-meta-key">paste this in your terminal, then sign in when the browser opens</span>
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        onClick={handleMcpCopy}
                        className={`v2-uset-tiny ${mcpCopied ? 'v2-uset-tiny-success' : ''}`}
                      >
                        {mcpCopied ? 'copied' : 'copy'}
                      </button>
                    </div>
                  </div>
                </Field>
              </Section>

              {/* SECTION 04 — ADMIN (waitlist) */}
              {isWaitlistAdmin && (
                <Section
                  ref={(el) => { sectionRefs.current['sect-admin'] = el; }}
                  id="sect-admin"
                  index="04"
                  label="admin"
                  hint="Waitlist queue for non-METU emails."
                  stagger={4}
                >
                  <Field
                    label="waitlist"
                    hint="Approving an email lets that user complete registration immediately."
                    open={false}
                    readOnly
                  >
                    <div className="v2-uset-val v2-uset-val-stack v2-uset-waitlist-body">
                      <div className="v2-uset-meta-row">
                        <span className="v2-uset-meta-key">
                          pending: <strong style={{ color: 'var(--txt-pure)' }}>{pendingWaitlistEntries.length}</strong>
                        </span>
                        <span style={{ flex: 1 }} />
                        <button
                          type="button"
                          onClick={() => void loadWaitlist()}
                          disabled={waitlistLoading}
                          className="v2-uset-tiny"
                        >
                          {waitlistLoading ? <><Spinner /> refreshing</> : 'refresh'}
                        </button>
                      </div>

                      {waitlistLoading && waitlistEntries.length === 0 ? (
                        <p className="v2-uset-val-empty">Loading waitlist…</p>
                      ) : pendingWaitlistEntries.length === 0 ? (
                        <p className="v2-uset-val-empty">No pending requests right now.</p>
                      ) : (
                        <div className="v2-uset-waitlist-list">
                          {pendingWaitlistEntries.map((entry) => {
                            const updating = !!waitlistUpdating[entry.id];
                            return (
                              <div key={entry.id} className="v2-uset-waitlist-row">
                                <div className="v2-uset-waitlist-info">
                                  <div className="v2-uset-waitlist-email">{entry.email}</div>
                                  <div className="v2-uset-waitlist-meta">
                                    {entry.nickname ? `${entry.nickname} · ` : ''}requested {formatDateTime(entry.requestedAt)}
                                  </div>
                                </div>
                                <div className="v2-uset-actions">
                                  <button
                                    type="button"
                                    className="v2-uset-btn v2-uset-btn-danger-ghost"
                                    onClick={() => updateWaitlistEntry(entry.id, 'rejected')}
                                    disabled={updating}
                                  >
                                    {updating ? <><Spinner /></> : 'reject'}
                                  </button>
                                  <button
                                    type="button"
                                    className="v2-uset-btn v2-uset-btn-primary"
                                    onClick={() => updateWaitlistEntry(entry.id, 'approved')}
                                    disabled={updating}
                                  >
                                    {updating ? <><Spinner /></> : 'approve'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {approvedWaitlistEntries.length > 0 && (
                        <>
                          <p className="v2-uset-waitlist-subhead">recently approved</p>
                          <div className="v2-uset-waitlist-list v2-uset-waitlist-list-mini">
                            {approvedWaitlistEntries.map((entry) => (
                              <div key={entry.id} className="v2-uset-waitlist-row v2-uset-waitlist-row-mini">
                                <div className="v2-uset-waitlist-info">
                                  <div className="v2-uset-waitlist-email">{entry.email}</div>
                                  <div className="v2-uset-waitlist-meta">
                                    approved {formatDateTime(entry.approvedAt)}
                                    {entry.approvedByEmail ? ` by ${entry.approvedByEmail}` : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </Field>
                </Section>
              )}

              {/* SECTION X — SESSION (sign out) */}
              <section
                ref={(el) => { sectionRefs.current['sect-session'] = el; }}
                id="sect-session"
                className={`v2-uset-section v2-uset-destroy ${confirmSignOut ? 'is-armed' : ''}`}
                style={{ ['--v2-uset-stagger' as string]: '5' }}
              >
                <header className="v2-uset-section-head">
                  <span className="v2-uset-section-num">X</span>
                  <span className="v2-uset-section-label">session</span>
                  <span className="v2-uset-section-rule" aria-hidden />
                  <span className="v2-uset-section-hint">Ends this browser&rsquo;s session.</span>
                </header>
                <div className="v2-uset-section-body">
                  <p className="v2-uset-destroy-text">
                    Signed in as <strong>{displayEmail || '—'}</strong>. Other browsers and the Claude Code MCP connection stay signed in.
                  </p>
                  <div className="v2-uset-destroy-actions">
                    {!confirmSignOut ? (
                      <button
                        type="button"
                        className="v2-uset-btn v2-uset-btn-danger-ghost"
                        onClick={() => setConfirmSignOut(true)}
                      >
                        sign out
                      </button>
                    ) : (
                      <>
                        <span className="v2-uset-destroy-confirm">are you sure?</span>
                        <span style={{ flex: 1 }} />
                        <button
                          type="button"
                          className="v2-uset-btn v2-uset-btn-ghost"
                          onClick={() => setConfirmSignOut(false)}
                          disabled={signingOut}
                        >
                          cancel
                        </button>
                        <button
                          type="button"
                          className="v2-uset-btn v2-uset-btn-danger"
                          onClick={handleSignOut}
                          disabled={signingOut}
                        >
                          {signingOut ? <><Spinner /> signing out</> : 'yes — sign out'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </main>
          </div>
        </>
      )}

      <style>{styles}</style>
    </div>
  );
}

/* ──────────────── Section ──────────────── */
type SectionProps = {
  id: string;
  index: string;
  label: string;
  hint?: string;
  stagger?: number;
  children: React.ReactNode;
};
const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { id, index, label, hint, stagger = 0, children },
  ref,
) {
  return (
    <section
      ref={ref}
      id={id}
      className="glass-card is-static v2-uset-section"
      style={{ ['--v2-uset-stagger' as string]: String(stagger) }}
    >
      <header className="v2-uset-section-head">
        <span className="v2-uset-section-num">{index}</span>
        <span className="v2-uset-section-label">{label}</span>
        <span className="v2-uset-section-rule" aria-hidden />
        {hint && <span className="v2-uset-section-hint">{hint}</span>}
      </header>
      <div className="v2-uset-section-body">{children}</div>
    </section>
  );
});

/* ──────────────── Field ──────────────── */
function Field({
  label,
  hint,
  open,
  onOpen,
  onCancel: _onCancel,
  actionLabel = 'edit',
  readOnly = false,
  children,
}: {
  label: string;
  hint?: string;
  open?: boolean;
  onOpen?: () => void;
  onCancel?: () => void;
  actionLabel?: string;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  const interactive = !readOnly && !open && !!onOpen;
  return (
    <div
      className={`v2-uset-field ${open ? 'is-editing' : ''} ${interactive ? 'is-interactive' : ''} ${readOnly ? 'is-readonly' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(); } } : undefined}
    >
      <div className="v2-uset-field-head">
        <span className="v2-uset-field-label">{label}</span>
        {hint && <span className="v2-uset-field-hint">{hint}</span>}
        {interactive && (
          <span className="v2-uset-field-action">
            <span aria-hidden>→</span> {actionLabel}
          </span>
        )}
      </div>
      <div className="v2-uset-field-body">{children}</div>
    </div>
  );
}

function FieldActions({ children }: { children: React.ReactNode }) {
  return <div className="v2-uset-actions">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="v2-uset-empty">— {children} —</span>;
}

function Spinner() {
  return <span className="v2-uset-spinner" aria-hidden />;
}

function SpecSkeleton() {
  return (
    <div className="v2-uset-skel">
      <div className="v2-uset-skel-bar" style={{ width: '20%', height: 11 }} />
      <div className="glass-card is-static v2-uset-skel-card">
        <div className="v2-uset-skel-bar" style={{ width: '32%' }} />
        <div className="v2-uset-skel-bar" style={{ width: '70%' }} />
        <div className="v2-uset-skel-bar" style={{ width: '54%' }} />
        <div className="v2-uset-skel-bar" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

const styles = `
  .v2-uset {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 80px;
    min-height: 70vh;
    animation: v2usetFade 540ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes v2usetFade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }
  .v2-uset-grid {
    position: absolute;
    inset: -40px -40px 0 -40px;
    background-image: radial-gradient(circle at 1px 1px, var(--rule, rgba(255,255,255,0.06)) 1px, transparent 0);
    background-size: 24px 24px;
    background-position: -1px -1px;
    pointer-events: none;
    opacity: 0.55;
    mask-image: linear-gradient(to bottom, transparent 0, black 80px, black calc(100% - 200px), transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 80px, black calc(100% - 200px), transparent 100%);
    z-index: 0;
  }
  .v2-uset > * { position: relative; z-index: 1; }

  .v2-uset-skel { display: flex; flex-direction: column; gap: 14px; }
  .v2-uset-skel-card { display: flex; flex-direction: column; gap: 14px; padding: 24px; }
  .v2-uset-skel-bar {
    height: 14px;
    background: rgba(var(--signature-rgb), 0.06);
    border-radius: 6px;
    animation: v2usetSkel 1.6s ease-in-out infinite;
  }
  @keyframes v2usetSkel {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.9; }
  }

  .v2-uset-band {
    display: flex; align-items: center; gap: 14px;
    padding: 0 4px;
    animation: v2usetBand 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 40ms;
  }
  @keyframes v2usetBand {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .v2-uset-band-eye {
    margin: 0;
    color: var(--signature);
    font-size: 11px;
    letter-spacing: 1.2px;
    flex-shrink: 0;
  }
  .v2-uset-band-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, var(--rule), transparent 80%);
  }
  .v2-uset-band-meta {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: var(--txt-faint);
    letter-spacing: 0.4px;
    text-transform: lowercase;
  }

  .v2-uset-shell {
    display: grid;
    grid-template-columns: 268px 1fr;
    gap: 36px;
  }
  @media (max-width: 1100px) {
    .v2-uset-shell { grid-template-columns: 232px 1fr; gap: 28px; }
  }
  @media (max-width: 880px) {
    .v2-uset-shell { grid-template-columns: 1fr; gap: 22px; }
  }

  .v2-uset-rail {
    animation: v2usetRail 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 80ms;
  }
  @keyframes v2usetRail {
    from { opacity: 0; transform: translateX(-12px); }
    to   { opacity: 1; transform: none; }
  }
  .v2-uset-rail-stick {
    position: sticky;
    top: 96px;
    display: flex; flex-direction: column;
    gap: 22px;
    padding: 4px;
  }
  @media (max-width: 880px) {
    .v2-uset-rail-stick { position: static; padding: 0; }
  }

  .v2-uset-id { display: flex; flex-direction: column; gap: 6px; }
  .v2-uset-name {
    font-size: 28px; font-weight: 600;
    letter-spacing: -0.022em;
    line-height: 1.05;
    color: var(--txt-pure);
    margin: 0;
    word-break: break-word;
  }
  .v2-uset-tag-desc {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--txt-muted);
    margin: 4px 0 0;
    letter-spacing: 0.2px;
    word-break: break-all;
  }

  .v2-uset-toc {
    display: flex; flex-direction: column; gap: 0;
    border-top: 1px solid var(--rule);
    padding-top: 18px;
    margin-top: 4px;
  }
  .v2-uset-toc-item {
    position: relative;
    display: grid;
    grid-template-columns: 32px 1fr;
    align-items: baseline;
    gap: 14px;
    padding: 9px 4px 9px 12px;
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px;
    text-decoration: none;
    text-transform: lowercase;
    letter-spacing: 0.4px;
    transition: color 220ms ease, padding-left 280ms cubic-bezier(0.16, 1, 0.3, 1);
    border-left: 2px solid transparent;
  }
  .v2-uset-toc-num {
    font-weight: 700;
    font-size: 11px;
    color: var(--txt-faint);
    transition: color 220ms ease;
  }
  .v2-uset-toc-label { color: inherit; transition: color 220ms ease; }
  .v2-uset-toc-item:hover { color: var(--txt-pure); }
  .v2-uset-toc-item:hover .v2-uset-toc-num { color: var(--signature); }
  .v2-uset-toc-item.is-active {
    color: var(--txt-pure);
    border-left-color: var(--signature);
  }
  .v2-uset-toc-item.is-active .v2-uset-toc-num { color: var(--signature); }
  .v2-uset-toc-item.is-danger { color: var(--txt-faint); }
  .v2-uset-toc-item.is-danger:hover { color: var(--danger); }
  .v2-uset-toc-item.is-danger:hover .v2-uset-toc-num { color: var(--danger); }
  .v2-uset-toc-item.is-danger.is-active {
    color: var(--danger);
    border-left-color: var(--danger);
  }
  .v2-uset-toc-item.is-danger.is-active .v2-uset-toc-num { color: var(--danger); }

  .v2-uset-spec {
    display: flex; flex-direction: column;
    gap: 18px;
  }

  .v2-uset-section {
    padding: 0;
    overflow: hidden;
    --v2-uset-stagger: 0;
    animation: v2usetSection 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(140ms + (var(--v2-uset-stagger) * 70ms));
  }
  @keyframes v2usetSection {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: none; }
  }
  .v2-uset-section-head {
    display: flex; align-items: baseline; gap: 14px;
    padding: 22px 28px 14px;
    border-bottom: 1px solid var(--rule);
  }
  .v2-uset-section-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--signature);
    padding: 3px 8px;
    border: 1px solid rgba(var(--signature-rgb), 0.30);
    background: rgba(var(--signature-rgb), 0.06);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .v2-uset-section-label {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.6px;
    color: var(--txt-pure);
    flex-shrink: 0;
  }
  .v2-uset-section-rule {
    flex: 1;
    height: 1px;
    background:
      linear-gradient(to right, var(--rule) 0, var(--rule) 60%, transparent 100%),
      repeating-linear-gradient(to right, var(--rule) 0 4px, transparent 4px 8px);
    background-blend-mode: normal;
    align-self: center;
    opacity: 0.6;
  }
  .v2-uset-section-hint {
    font-size: 11.5px;
    color: var(--txt-faint);
    letter-spacing: 0.05px;
    flex-shrink: 0;
  }
  .v2-uset-section-body { display: flex; flex-direction: column; }

  .v2-uset-field {
    position: relative;
    display: grid;
    grid-template-columns: 168px 1fr;
    gap: 28px;
    padding: 18px 28px;
    border-bottom: 1px solid var(--rule);
    transition: background 220ms ease, padding-left 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v2-uset-field:last-child { border-bottom: none; }
  .v2-uset-field::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: var(--signature);
    transform: scaleY(0);
    transform-origin: top center;
    transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v2-uset-field.is-editing::before { transform: scaleY(1); }
  .v2-uset-field.is-editing {
    background: rgba(var(--signature-rgb), 0.025);
    padding-left: 32px;
  }
  .v2-uset-field.is-interactive { cursor: pointer; }
  .v2-uset-field.is-interactive:hover {
    background: rgba(var(--signature-rgb), 0.018);
  }
  .v2-uset-field.is-interactive:hover .v2-uset-field-action {
    opacity: 1;
    transform: translateX(0);
  }
  .v2-uset-field.is-interactive:focus-visible {
    outline: none;
    background: rgba(var(--signature-rgb), 0.04);
    box-shadow: inset 2px 0 0 var(--signature);
  }
  @media (max-width: 720px) {
    .v2-uset-field {
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 16px 20px;
    }
    .v2-uset-field.is-editing { padding-left: 24px; }
  }

  .v2-uset-field-head {
    display: flex; flex-direction: column; gap: 4px;
    min-width: 0;
  }
  .v2-uset-field-label {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    color: var(--txt-pure);
    margin: 4px 0 0;
  }
  .v2-uset-field-hint {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--txt-faint);
    letter-spacing: 0.05px;
    max-width: 24ch;
  }
  .v2-uset-field-action {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--signature);
    letter-spacing: 0.5px;
    text-transform: lowercase;
    margin-top: 2px;
    opacity: 0;
    transform: translateX(-3px);
    transition: opacity 200ms ease, transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v2-uset-field.is-editing .v2-uset-field-action { display: none; }
  .v2-uset-field-body { min-width: 0; display: flex; flex-direction: column; gap: 10px; }

  .v2-uset-val {
    margin: 0;
    font-size: 14.5px;
    line-height: 1.55;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
    word-break: break-word;
  }
  .v2-uset-val-display {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .v2-uset-val-row { display: flex; align-items: center; gap: 14px; }
  .v2-uset-val-stack { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
  .v2-uset-val-empty {
    color: var(--txt-faint);
    font-size: 13px;
    line-height: 1.55;
    max-width: 60ch;
  }
  .v2-uset-empty { color: var(--txt-faint); font-style: italic; font-size: 14.5px; }

  .v2-uset-avatar {
    width: 56px; height: 56px;
    border-radius: 50%;
    background: rgba(var(--signature-rgb), 0.08);
    border: 1px solid var(--rule);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 14px;
    font-weight: 700;
    color: var(--signature);
    flex-shrink: 0;
  }
  .v2-uset-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .v2-uset-avatar-actions { display: inline-flex; gap: 8px; }

  .v2-uset-anchor {
    display: inline-flex; align-items: center; gap: 8px;
    color: var(--txt-pure);
    text-decoration: none;
    padding: 6px 11px 6px 9px;
    border: 1px solid var(--rule);
    border-radius: 7px;
    background: rgba(var(--signature-rgb), 0.020);
    font-size: 13px;
    align-self: flex-start;
    width: fit-content;
  }
  .v2-uset-anchor code {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12.5px;
  }
  .v2-uset-anchor svg { opacity: 0.7; }

  .v2-uset-meta-row {
    display: inline-flex; align-items: center; gap: 8px;
    width: 100%;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--txt-faint);
    letter-spacing: 0.3px;
  }
  .v2-uset-meta-key { color: var(--txt-faint); }
  .v2-uset-mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--rule);
    background: rgba(var(--signature-rgb), 0.030);
    color: var(--txt-pure);
    align-self: flex-start;
    width: fit-content;
    word-break: break-all;
  }
  .v2-uset-mono-lg { font-size: 13px; padding: 4px 10px; }

  .v2-uset-mcp-code {
    display: block;
    padding: 10px 12px;
    background: rgba(var(--signature-rgb), 0.05);
    border: 1px solid var(--rule);
    border-radius: 7px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    color: var(--txt-pure);
    letter-spacing: 0.2px;
    overflow-x: auto;
    white-space: nowrap;
  }

  .v2-uset-toggle {
    display: inline-flex;
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
    align-self: flex-start;
    background: rgba(var(--signature-rgb), 0.020);
    transition: border-color 200ms ease;
  }
  .v2-uset-toggle:hover { border-color: rgba(var(--signature-rgb), 0.40); }
  .v2-uset-toggle-cell {
    background: transparent;
    border: none;
    padding: 7px 14px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--txt-faint);
    cursor: pointer;
    border-radius: 5px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: background 220ms ease, color 220ms ease;
  }
  .v2-uset-toggle-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.35;
    transition: opacity 220ms ease, box-shadow 220ms ease, background 220ms ease;
  }
  .v2-uset-toggle-cell.is-on {
    background: rgba(var(--signature-rgb), 0.14);
    color: var(--signature);
  }
  .v2-uset-toggle-cell.is-on .v2-uset-toggle-dot {
    opacity: 1;
    box-shadow: 0 0 6px var(--signature);
  }
  .v2-uset-toggle-cell:hover:not(:disabled):not(.is-on) { color: var(--txt-pure); }

  .v2-uset-edit { display: flex; flex-direction: column; gap: 12px; }
  .v2-uset-input {
    padding: 10px 14px;
    background: rgba(var(--signature-rgb), 0.020);
    border: 1px solid var(--rule);
    border-radius: 8px;
    color: var(--txt-pure);
    font-family: inherit;
    font-size: 13.5px;
    outline: none;
    width: 100%;
    transition: border-color 200ms ease, background 200ms ease;
  }
  .v2-uset-input:focus {
    border-color: rgba(var(--signature-rgb), 0.50);
    background: rgba(var(--signature-rgb), 0.045);
  }
  .v2-uset-input::placeholder { color: var(--txt-faint); }
  .v2-uset-input-display {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.015em;
    padding: 12px 14px;
  }

  .v2-uset-actions {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    padding-top: 4px;
  }

  .v2-uset-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 16px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    cursor: pointer; text-decoration: none;
    border: 1px solid;
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease, color 200ms ease;
  }
  .v2-uset-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
  .v2-uset-btn-primary { background: var(--signature); border-color: var(--signature); color: #fff; }
  .v2-uset-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px -8px rgba(var(--signature-rgb), 0.55);
  }
  .v2-uset-btn-ghost { background: transparent; border-color: var(--rule); color: var(--txt-muted); }
  .v2-uset-btn-ghost:hover:not(:disabled) { color: var(--txt-pure); border-color: var(--rule-strong, var(--rule)); }
  .v2-uset-btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
  .v2-uset-btn-danger:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 26px -10px rgba(255, 59, 48, 0.55);
  }
  .v2-uset-btn-danger-ghost { background: transparent; border-color: rgba(255, 59, 48, 0.40); color: var(--danger); }
  .v2-uset-btn-danger-ghost:hover:not(:disabled) { background: rgba(255, 59, 48, 0.08); }

  .v2-uset-tiny {
    background: transparent;
    border: 1px solid var(--rule);
    color: var(--txt-muted);
    padding: 5px 11px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: lowercase;
    cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; gap: 5px;
    transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
  }
  .v2-uset-tiny:hover:not(:disabled) {
    color: var(--signature);
    border-color: rgba(var(--signature-rgb), 0.42);
    background: rgba(var(--signature-rgb), 0.05);
  }
  .v2-uset-tiny:disabled { opacity: 0.4; cursor: not-allowed; }
  .v2-uset-tiny-file { cursor: pointer; }
  .v2-uset-tiny-danger {
    color: var(--danger);
    border-color: rgba(255, 59, 48, 0.30);
  }
  .v2-uset-tiny-danger:hover:not(:disabled) {
    color: var(--danger);
    border-color: rgba(255, 59, 48, 0.55);
    background: rgba(255, 59, 48, 0.06);
  }
  .v2-uset-tiny-success {
    color: var(--success);
    border-color: rgba(16, 185, 129, 0.45);
    background: rgba(16, 185, 129, 0.08);
  }

  .v2-uset-spinner {
    width: 10px; height: 10px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    opacity: 0.6;
    animation: v2usetSpin 700ms linear infinite;
    display: inline-block;
  }
  @keyframes v2usetSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* Waitlist nested list */
  .v2-uset-waitlist-body { gap: 14px; }
  .v2-uset-waitlist-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .v2-uset-waitlist-list-mini { gap: 6px; margin-top: 6px; }
  .v2-uset-waitlist-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: rgba(var(--signature-rgb), 0.04);
  }
  .v2-uset-waitlist-row-mini {
    padding: 8px 12px;
    background: transparent;
  }
  .v2-uset-waitlist-info { flex: 1; min-width: 0; }
  .v2-uset-waitlist-email {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
    margin-bottom: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v2-uset-waitlist-meta {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--txt-faint);
    letter-spacing: 0.2px;
  }
  .v2-uset-waitlist-subhead {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: var(--txt-faint);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin: 6px 0 0;
  }

  /* Destroy section (sign out) */
  .v2-uset-destroy {
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(255, 59, 48, 0.30) 0%,
        rgba(255, 59, 48, 0.06) 50%,
        rgba(255, 59, 48, 0.18) 100%) border-box !important;
    transition: box-shadow 280ms ease, transform 280ms ease;
  }
  .v2-uset-destroy.is-armed {
    box-shadow:
      0 0 0 1px rgba(255, 59, 48, 0.50),
      0 18px 40px -16px rgba(255, 59, 48, 0.30) !important;
  }
  .v2-uset-destroy .v2-uset-section-num {
    background: rgba(255, 59, 48, 0.08);
    border-color: rgba(255, 59, 48, 0.40);
    color: var(--danger);
  }
  .v2-uset-destroy .v2-uset-section-rule {
    background:
      repeating-linear-gradient(to right, rgba(255, 59, 48, 0.30) 0 4px, transparent 4px 8px);
  }
  .v2-uset-destroy-text {
    margin: 0 0 14px;
    padding: 18px 28px 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--txt-muted);
    max-width: 60ch;
  }
  .v2-uset-destroy-actions {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 0 28px 22px;
  }
  .v2-uset-destroy-confirm {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    font-weight: 600;
    text-transform: lowercase;
    letter-spacing: 0.5px;
    color: var(--danger);
  }

  /* Light-mode pass */
  html.light .v2-uset-grid,
  .light .v2-uset-grid {
    background-image: radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.10) 1px, transparent 0);
    opacity: 0.42;
  }
  html.light .v2-uset-input,
  .light .v2-uset-input {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(0, 0, 0, 0.10);
  }
  html.light .v2-uset-input:focus,
  .light .v2-uset-input:focus {
    background: rgba(255, 255, 255, 0.96);
    border-color: rgba(var(--signature-rgb), 0.5);
  }
  html.light .v2-uset-mono,
  .light .v2-uset-mono,
  html.light .v2-uset-mcp-code,
  .light .v2-uset-mcp-code {
    background: rgba(20, 14, 30, 0.04);
    border-color: rgba(0, 0, 0, 0.08);
  }
  html.light .v2-uset-anchor,
  .light .v2-uset-anchor {
    background: rgba(20, 14, 30, 0.025);
    border-color: rgba(0, 0, 0, 0.08);
  }
  html.light .v2-uset-toggle,
  .light .v2-uset-toggle {
    background: rgba(20, 14, 30, 0.025);
    border-color: rgba(0, 0, 0, 0.10);
  }
  html.light .v2-uset-tiny,
  .light .v2-uset-tiny {
    background: rgba(20, 14, 30, 0.025);
  }
  html.light .v2-uset-toc-item,
  .light .v2-uset-toc-item {
    color: #6e6b76;
  }
  html.light .v2-uset-toc-item:hover,
  .light .v2-uset-toc-item:hover {
    color: #1d1d1f;
  }
  html.light .v2-uset-section-rule,
  .light .v2-uset-section-rule {
    background:
      repeating-linear-gradient(to right, rgba(0, 0, 0, 0.10) 0 4px, transparent 4px 8px);
  }
  html.light .v2-uset-field.is-editing,
  .light .v2-uset-field.is-editing {
    background: rgba(var(--signature-rgb), 0.045);
  }
  html.light .v2-uset-field.is-interactive:hover,
  .light .v2-uset-field.is-interactive:hover {
    background: rgba(var(--signature-rgb), 0.030);
  }
`;

export default function V2SettingsPage() {
  return (
    <Suspense fallback={null}>
      <V2SettingsPageInner />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card">
      <span className="recgon-label">{title}</span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.65rem 0.875rem',
  background: 'var(--btn-secondary-bg)',
  border: '1px solid var(--btn-secondary-border)',
  borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)',
  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 500,
  color: 'var(--txt-muted)', marginBottom: '0.35rem',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

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

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function AccountPageInner() {
  const { data: session, update } = useSession();
  const searchParams = useSearchParams();
  const sessionAvatarUrl = (session?.user as { avatarUrl?: string } | undefined)?.avatarUrl;

  const [nicknameValue, setNicknameValue] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [nicknameLoading, setNicknameLoading] = useState(false);

  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [githubDisconnecting, setGithubDisconnecting] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isWaitlistAdmin, setIsWaitlistAdmin] = useState(false);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistStatus, setWaitlistStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [waitlistUpdating, setWaitlistUpdating] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (sessionAvatarUrl) setAvatarUrl(sessionAvatarUrl);
    if (!session?.user) return;

    fetch('/api/account')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setIsWaitlistAdmin(!!data.isWaitlistAdmin);
        if (data.avatarUrl) {
          setAvatarUrl(data.avatarUrl);
        } else if (!sessionAvatarUrl) {
          setAvatarUrl(null);
        }
      })
      .catch(() => {});
  }, [session?.user?.id, sessionAvatarUrl]);

  useEffect(() => {
    fetch('/api/github/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setGithubStatus(data))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!isWaitlistAdmin) return;
    void loadWaitlist();
  }, [isWaitlistAdmin]);

  // Show feedback after GitHub OAuth redirect
  useEffect(() => {
    const github = searchParams.get('github');
    if (github === 'connected') {
      setGithubStatus((s) => s ? { ...s, connected: true } : { connected: true, username: null });
      // Re-fetch to get username
      fetch('/api/github/status')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => data && setGithubStatus(data))
        .catch(() => null);
    }
  }, [searchParams]);

  const [mcpCopied, setMcpCopied] = useState(false);

  function handleMcpCopy() {
    navigator.clipboard.writeText('claude mcp add recgon --transport http https://recgon-ai.vercel.app/mcp');
    setMcpCopied(true);
    setTimeout(() => setMcpCopied(false), 2000);
  }

  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const pendingWaitlistEntries = waitlistEntries.filter((entry) => entry.status === 'pending');
  const approvedWaitlistEntries = waitlistEntries.filter((entry) => entry.status === 'approved').slice(0, 8);

  async function loadWaitlist() {
    setWaitlistLoading(true);
    setWaitlistStatus(null);
    const res = await fetch('/api/admin/waitlist');
    const data = await res.json().catch(() => ({}));
    setWaitlistLoading(false);

    if (!res.ok) {
      setWaitlistStatus({ type: 'error', msg: data.error || 'Failed to load waitlist' });
      return;
    }

    setWaitlistEntries(data.entries ?? []);
  }

  async function updateWaitlistEntry(id: string, status: 'approved' | 'rejected') {
    setWaitlistStatus(null);
    setWaitlistUpdating((prev) => ({ ...prev, [id]: true }));

    const res = await fetch('/api/admin/waitlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json().catch(() => ({}));

    setWaitlistUpdating((prev) => ({ ...prev, [id]: false }));

    if (!res.ok) {
      setWaitlistStatus({ type: 'error', msg: data.error || 'Failed to update waitlist' });
      return;
    }

    const updatedEntry = data.entry as WaitlistEntry;
    setWaitlistEntries((prev) => {
      const next = prev.map((entry) => entry.id === updatedEntry.id ? updatedEntry : entry);
      return next.sort((a, b) => {
        if (a.status === b.status) {
          return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
        }
        if (a.status === 'pending') return -1;
        if (b.status === 'pending') return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });
    setWaitlistStatus({ type: 'success', msg: status === 'approved' ? 'Email approved for registration' : 'Email removed from the approval queue' });
  }

  async function handleNicknameChange(e: React.FormEvent) {
    e.preventDefault();
    setNicknameStatus(null);
    setNicknameLoading(true);
    const res = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nickname', nickname: nicknameValue }),
    });
    const data = await res.json();
    setNicknameLoading(false);
    if (!res.ok) {
      setNicknameStatus({ type: 'error', msg: data.error });
    } else {
      await update({ nickname: data.nickname });
      setNicknameStatus({ type: 'success', msg: 'Nickname updated' });
      setNicknameValue('');
    }
  }

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus(null);
    setEmailLoading(true);
    const res = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email', ...emailForm }),
    });
    const data = await res.json();
    setEmailLoading(false);
    if (!res.ok) {
      setEmailStatus({ type: 'error', msg: data.error });
    } else {
      await update({ email: emailForm.newEmail });
      setEmailStatus({ type: 'success', msg: 'Email updated. Please sign in again.' });
      setEmailForm({ newEmail: '', password: '' });
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordStatus({ type: 'error', msg: 'New passwords do not match' });
      return;
    }
    setPasswordLoading(true);
    const res = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'password', currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
    });
    const data = await res.json();
    setPasswordLoading(false);
    if (!res.ok) {
      setPasswordStatus({ type: 'error', msg: data.error });
    } else {
      setPasswordStatus({ type: 'success', msg: 'Password updated successfully' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/account/avatar', { method: 'POST', body: formData });
    const data = await res.json();
    setAvatarUploading(false);
    if (res.ok) {
      setAvatarUrl(data.avatarUrl);
      await update({ avatarUrl: data.avatarUrl });
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    await fetch('/api/account/avatar', { method: 'DELETE' });
    setAvatarUrl(null);
    await update({ avatarUrl: '' });
    setAvatarUploading(false);
  }

  async function handleGithubDisconnect() {
    setGithubDisconnecting(true);
    await fetch('/api/github/connect', { method: 'DELETE' });
    setGithubStatus({ connected: false, username: null });
    setGithubDisconnecting(false);
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.25rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>account</h1>
        <p style={{ color: 'var(--txt-muted)', margin: 0, fontSize: '0.875rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
          <span style={{ color: 'var(--signature)', opacity: 0.7 }}>›</span> {session?.user?.email}
        </p>
      </div>

      {/* Profile Photo */}
      <Section title="Profile Photo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            border: '2px solid var(--border)',
            background: 'var(--accent-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>
                {(session?.user?.nickname || session?.user?.email || '?').slice(0, 2)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ color: 'var(--txt-muted)', fontSize: '0.8rem', margin: 0 }}>
              JPEG, PNG, WebP or GIF. Max 2MB.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                style={{
                  padding: '0.45rem 1rem',
                  background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                  border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600,
                  fontSize: '0.8rem', cursor: avatarUploading ? 'not-allowed' : 'pointer',
                  opacity: avatarUploading ? 0.7 : 1,
                }}
              >
                {avatarUploading ? 'Uploading...' : 'Upload Photo'}
              </button>
              {avatarUrl && (
                <button
                  onClick={handleAvatarRemove}
                  disabled={avatarUploading}
                  style={{
                    padding: '0.45rem 1rem',
                    background: 'transparent', color: 'var(--danger)',
                    border: '1px solid var(--danger)', borderRadius: 'var(--r-sm)',
                    fontWeight: 600, fontSize: '0.8rem',
                    cursor: avatarUploading ? 'not-allowed' : 'pointer',
                    opacity: avatarUploading ? 0.6 : 1,
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Change Nickname */}
      <Section title="Nickname">
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          Currently: <strong style={{ color: 'var(--txt-pure)' }}>{session?.user?.nickname || '—'}</strong>
        </p>
        <form onSubmit={handleNicknameChange} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>New Nickname</label>
            <input
              type="text" required minLength={2} style={inputStyle}
              placeholder="Enter a new nickname"
              value={nicknameValue}
              onChange={(e) => setNicknameValue(e.target.value)}
            />
          </div>
          <button type="submit" disabled={nicknameLoading} style={{
            padding: '0.65rem 1.25rem', flexShrink: 0,
            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
            border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600,
            fontSize: '0.875rem', cursor: nicknameLoading ? 'not-allowed' : 'pointer',
            opacity: nicknameLoading ? 0.7 : 1,
          }}>
            {nicknameLoading ? 'Saving…' : 'Save'}
          </button>
        </form>
        {nicknameStatus && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: nicknameStatus.type === 'error' ? 'var(--danger)' : 'var(--success)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            {nicknameStatus.type === 'error' ? '! ' : '› '}{nicknameStatus.msg}
          </p>
        )}
      </Section>

      {/* Change Email */}
      <Section title="Change Email">
        <form onSubmit={handleEmailChange} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={labelStyle}>New Email</label>
            <input
              type="email" required style={inputStyle}
              placeholder="new@example.com"
              value={emailForm.newEmail}
              onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Current Password</label>
            <input
              type="password" required style={inputStyle}
              placeholder="Confirm with your password"
              value={emailForm.password}
              onChange={(e) => setEmailForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          {emailStatus && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: emailStatus.type === 'error' ? 'var(--danger)' : 'var(--success)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              {emailStatus.type === 'error' ? '! ' : '› '}{emailStatus.msg}
            </p>
          )}
          <button type="submit" disabled={emailLoading} style={{
            alignSelf: 'flex-start', padding: '0.55rem 1.25rem',
            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
            border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600,
            fontSize: '0.875rem', cursor: emailLoading ? 'not-allowed' : 'pointer',
            opacity: emailLoading ? 0.7 : 1,
          }}>
            {emailLoading ? 'Saving…' : 'Update Email'}
          </button>
        </form>
      </Section>

      {/* Change Password */}
      <Section title="Change Password">
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={labelStyle}>Current Password</label>
            <input
              type="password" required style={inputStyle}
              placeholder="••••••••"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
          </div>
          <div>
            <label style={labelStyle}>New Password</label>
            <input
              type="password" required minLength={8} style={inputStyle}
              placeholder="Min. 8 characters"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password" required style={inputStyle}
              placeholder="••••••••"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
            />
          </div>
          {passwordStatus && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: passwordStatus.type === 'error' ? 'var(--danger)' : 'var(--success)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              {passwordStatus.type === 'error' ? '! ' : '› '}{passwordStatus.msg}
            </p>
          )}
          <button type="submit" disabled={passwordLoading} style={{
            alignSelf: 'flex-start', padding: '0.55rem 1.25rem',
            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
            border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600,
            fontSize: '0.875rem', cursor: passwordLoading ? 'not-allowed' : 'pointer',
            opacity: passwordLoading ? 0.7 : 1,
          }}>
            {passwordLoading ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </Section>

      {/* GitHub */}
      <Section title="GitHub">
        {githubStatus === null ? (
          <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: 0 }}>Loading…</p>
        ) : githubStatus.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--txt-muted)', flexShrink: 0 }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span style={{ fontSize: '0.875rem', color: 'var(--txt-pure)' }}>
                {githubStatus.username ? (
                  <><strong>{githubStatus.username}</strong> connected</>
                ) : (
                  'Connected'
                )}
              </span>
            </div>
            <button
              onClick={handleGithubDisconnect}
              disabled={githubDisconnecting}
              style={{
                padding: '0.45rem 1rem',
                background: 'transparent',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--r-sm)', fontWeight: 600,
                fontSize: '0.8rem', cursor: githubDisconnecting ? 'not-allowed' : 'pointer',
                opacity: githubDisconnecting ? 0.6 : 1, flexShrink: 0,
              }}
            >
              {githubDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              Connect your GitHub account to import repositories directly into Recgon.
            </p>
            <a
              href="/api/github/connect"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.55rem 1.25rem',
                background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)',
                border: '1px solid var(--btn-secondary-border)',
                borderRadius: 'var(--r-sm)', fontWeight: 600,
                fontSize: '0.875rem', textDecoration: 'none',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Connect GitHub
            </a>
          </>
        )}
      </Section>

      {/* Claude Code */}
      <Section title="Claude Code">
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          Connect Recgon to Claude Code to get project insights, next steps, and developer prompts directly in your editor.
        </p>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
          Run this command in your terminal, then sign in when the browser opens:
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--btn-secondary-bg)',
          border: '1px solid var(--btn-secondary-border)',
          borderRadius: 'var(--r-sm)', padding: '0.6rem 0.875rem',
        }}>
          <code style={{
            flex: 1, fontSize: '0.8rem', color: 'var(--txt-pure)',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            claude mcp add recgon --transport http https://recgon-ai.vercel.app/mcp
          </code>
          <button
            onClick={handleMcpCopy}
            style={{
              flexShrink: 0, padding: '0.35rem 0.75rem',
              background: mcpCopied ? 'var(--success)' : 'var(--btn-primary-bg)',
              color: mcpCopied ? '#fff' : 'var(--btn-primary-txt)',
              border: 'none', borderRadius: 'var(--r-sm)',
              fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {mcpCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </Section>

      {isWaitlistAdmin && (
        <Section title="Waitlist">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <p style={{ margin: '0 0 0.25rem', color: 'var(--txt-pure)', fontSize: '0.92rem', fontWeight: 600 }}>
                Pending approvals: {pendingWaitlistEntries.length}
              </p>
              <p style={{ margin: 0, color: 'var(--txt-muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                Non-METU emails land here first. Approving one lets that email complete registration immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWaitlist()}
              disabled={waitlistLoading}
              style={{
                flexShrink: 0, padding: '0.45rem 0.95rem',
                background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)',
                border: '1px solid var(--btn-secondary-border)',
                borderRadius: 'var(--r-sm)', fontWeight: 600,
                fontSize: '0.8rem', cursor: waitlistLoading ? 'not-allowed' : 'pointer',
                opacity: waitlistLoading ? 0.7 : 1,
              }}
            >
              {waitlistLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {waitlistStatus && (
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: waitlistStatus.type === 'error' ? 'var(--danger)' : 'var(--success)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
              {waitlistStatus.type === 'error' ? '! ' : '› '}{waitlistStatus.msg}
            </p>
          )}

          {waitlistLoading && waitlistEntries.length === 0 ? (
            <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: 0 }}>Loading waitlist…</p>
          ) : pendingWaitlistEntries.length === 0 ? (
            <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: 0 }}>No pending requests right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: approvedWaitlistEntries.length > 0 ? '1.25rem' : 0 }}>
              {pendingWaitlistEntries.map((entry) => {
                const updating = !!waitlistUpdating[entry.id];
                return (
                  <div
                    key={entry.id}
                    style={{
                      border: '1px solid var(--btn-secondary-border)',
                      background: 'var(--btn-secondary-bg)',
                      borderRadius: 'var(--r-sm)',
                      padding: '0.9rem 1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                      <div>
                        <p style={{ margin: '0 0 0.3rem', color: 'var(--txt-pure)', fontSize: '0.9rem', fontWeight: 600 }}>
                          {entry.email}
                        </p>
                        <p style={{ margin: '0 0 0.25rem', color: 'var(--txt-muted)', fontSize: '0.8rem' }}>
                          {entry.nickname ? `Name: ${entry.nickname}` : 'No nickname provided'}
                        </p>
                        <p style={{ margin: 0, color: 'var(--txt-faint)', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                          requested {formatDateTime(entry.requestedAt)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => void updateWaitlistEntry(entry.id, 'approved')}
                          disabled={updating}
                          style={{
                            padding: '0.45rem 0.95rem',
                            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                            border: 'none', borderRadius: 'var(--r-sm)',
                            fontWeight: 600, fontSize: '0.8rem',
                            cursor: updating ? 'not-allowed' : 'pointer',
                            opacity: updating ? 0.7 : 1,
                          }}
                        >
                          {updating ? 'Saving…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateWaitlistEntry(entry.id, 'rejected')}
                          disabled={updating}
                          style={{
                            padding: '0.45rem 0.95rem',
                            background: 'transparent', color: 'var(--danger)',
                            border: '1px solid var(--danger)', borderRadius: 'var(--r-sm)',
                            fontWeight: 600, fontSize: '0.8rem',
                            cursor: updating ? 'not-allowed' : 'pointer',
                            opacity: updating ? 0.65 : 1,
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {approvedWaitlistEntries.length > 0 && (
            <>
              <p style={{ margin: '0 0 0.75rem', color: 'var(--txt-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recently approved
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {approvedWaitlistEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      border: '1px solid var(--btn-secondary-border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '0.75rem 0.9rem',
                    }}
                  >
                    <p style={{ margin: '0 0 0.25rem', color: 'var(--txt-pure)', fontSize: '0.86rem', fontWeight: 600 }}>
                      {entry.email}
                    </p>
                    <p style={{ margin: 0, color: 'var(--txt-faint)', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                      approved {formatDateTime(entry.approvedAt)}{entry.approvedByEmail ? ` by ${entry.approvedByEmail}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {/* Sign Out */}
      <Section title="Sign Out">
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          You are signed in as <strong style={{ color: 'var(--txt-pure)' }}>{session?.user?.email}</strong>.
        </p>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            padding: '0.55rem 1.25rem',
            background: 'transparent',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-sm)', fontWeight: 600,
            fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </Section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountPageInner />
    </Suspense>
  );
}

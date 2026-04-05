'use client';

import { useState, useEffect, useRef } from 'react';
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

export default function AccountPage() {
  const { data: session, update } = useSession();
  const searchParams = useSearchParams();

  const [nicknameValue, setNicknameValue] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [nicknameLoading, setNicknameLoading] = useState(false);

  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [githubDisconnecting, setGithubDisconnecting] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = (session?.user as { avatarUrl?: string } | undefined)?.avatarUrl;
    if (url) {
      setAvatarUrl(url);
    } else if (session?.user) {
      // JWT may be stale — fetch the current value from the DB
      fetch('/api/account')
        .then((r) => r.json())
        .then((d) => { if (d.avatarUrl) setAvatarUrl(d.avatarUrl); })
        .catch(() => {});
    }
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/github/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setGithubStatus(data))
      .catch(() => null);
  }, []);

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

  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

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

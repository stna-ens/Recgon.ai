'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

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

export default function AccountPage() {
  const { data: session, update } = useSession();

  const [nicknameValue, setNicknameValue] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [nicknameLoading, setNicknameLoading] = useState(false);

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

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.25rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>account</h1>
        <p style={{ color: 'var(--txt-muted)', margin: 0, fontSize: '0.875rem', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
          <span style={{ color: 'var(--signature)', opacity: 0.7 }}>›</span> {session?.user?.email}
        </p>
      </div>

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

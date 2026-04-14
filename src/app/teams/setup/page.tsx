'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RecgonLogo from '@/components/RecgonLogo';
import { useTeam } from '@/components/TeamProvider';

export default function TeamSetupPage() {
  const router = useRouter();
  const { refreshTeams } = useTeam();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [teamName, setTeamName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await refreshTeams();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Extract token from URL or use raw token
      let token = inviteToken.trim();
      const urlMatch = token.match(/\/teams\/invite\/([a-f0-9]+)/);
      if (urlMatch) token = urlMatch[1];

      const res = await fetch('/api/teams/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await refreshTeams();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join team');
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 500,
    color: 'var(--txt-muted)', marginBottom: '0.35rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.875rem',
    background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem',
    outline: 'none', boxSizing: 'border-box',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '0.7rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
    border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem',
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, width: '100%',
  };
  const btnSecondary: React.CSSProperties = {
    padding: '0.7rem', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)',
    border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)',
    fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', width: '100%',
  };

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '380px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '2rem' }}>
          <RecgonLogo size={28} uid="logo-team-setup" />
          <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--signature)', letterSpacing: '-0.3px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Recgon</span>
        </div>

        {mode === 'choose' && (
          <>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>Set up your team</h1>
            <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.875rem' }}>
              Create a new team or join an existing one to get started.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button onClick={() => setMode('create')} style={btnPrimary}>
                Create a Team
              </button>
              <button onClick={() => setMode('join')} style={btnSecondary}>
                Join with Invite Link
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>Create a team</h1>
            <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.875rem' }}>
              Give your team a name. You can invite members after.
            </p>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Team Name</label>
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="My awesome team" required minLength={2} style={inputStyle} />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
              <button type="submit" disabled={loading} style={btnPrimary}>
                {loading ? 'Creating...' : 'Create Team'}
              </button>
              <button type="button" onClick={() => { setMode('choose'); setError(''); }} style={{ ...btnSecondary, marginTop: '-0.25rem' }}>
                Back
              </button>
            </form>
          </>
        )}

        {mode === 'join' && (
          <>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>Join a team</h1>
            <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.875rem' }}>
              Paste the invitation link or token you received.
            </p>

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Invite Link or Token</label>
                <input type="text" value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Paste invite link or token" required style={inputStyle} />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
              <button type="submit" disabled={loading} style={btnPrimary}>
                {loading ? 'Joining...' : 'Join Team'}
              </button>
              <button type="button" onClick={() => { setMode('choose'); setError(''); }} style={{ ...btnSecondary, marginTop: '-0.25rem' }}>
                Back
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

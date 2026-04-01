'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTeam } from '@/components/TeamProvider';

export default function TeamsPage() {
  const { teams, refreshTeams } = useTeam();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
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
      setShowCreate(false);
      setTeamName('');
      router.push(`/teams/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: 0, letterSpacing: '-0.3px' }}>Teams</h1>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '0.5rem 1rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
          border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
        }}>
          {showCreate ? 'Cancel' : 'New Team'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team Name</label>
            <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="My team" required minLength={2} style={{
              width: '100%', padding: '0.55rem 0.75rem', background: 'var(--btn-secondary-bg)',
              border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)',
              color: 'var(--txt-pure)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
            }} />
          </div>
          <button type="submit" disabled={loading} style={{
            padding: '0.55rem 1rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
            border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.85rem',
            cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
            {loading ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0 0 1rem' }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {teams.map((team) => (
          <Link key={team.id} href={`/teams/${team.id}`} style={{
            padding: '1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', textDecoration: 'none', color: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: 'var(--txt-pure)' }}>{team.name}</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--txt-muted)' }}>
                {team.role === 'owner' ? 'Owner' : team.role === 'member' ? 'Member' : 'Viewer'}
              </p>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="var(--txt-muted)" strokeWidth={2}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
        {teams.length === 0 && (
          <p style={{ color: 'var(--txt-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
            No teams yet. Create one to get started.
          </p>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';

interface Member {
  teamId: string;
  userId: string;
  role: string;
  joinedAt: string;
  nickname?: string;
  email?: string;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  role: string;
}

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { refreshTeams } = useTeam();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [teamRes, membersRes] = await Promise.all([
          fetch(`/api/teams/${id}`),
          fetch(`/api/teams/${id}/members`),
        ]);
        if (teamRes.ok) setTeam(await teamRes.json());
        if (membersRes.ok) setMembers(await membersRes.json());
      } catch {
        setError('Failed to load team');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    setInviteLink('');

    try {
      const res = await fetch(`/api/teams/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setInviteLink(`${window.location.origin}/teams/invite/${data.token}`);
      setInviteEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this member from the team?')) return;
    try {
      const res = await fetch(`/api/teams/${id}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setMembers(members.filter((m) => m.userId !== userId));
      }
    } catch {
      // silently fail
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      await fetch(`/api/teams/${id}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      setMembers(members.map((m) => m.userId === userId ? { ...m, role: newRole } : m));
    } catch {
      // silently fail
    }
  }

  async function handleDeleteTeam() {
    if (!confirm('Are you sure you want to delete this team? All projects and data will be permanently lost.')) return;
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await refreshTeams();
        router.push('/teams');
      }
    } catch {
      setError('Failed to delete team');
    }
  }

  if (loading) {
    return <p style={{ color: 'var(--txt-muted)', padding: '2rem 0' }}>Loading...</p>;
  }

  if (!team) {
    return <p style={{ color: 'var(--danger)', padding: '2rem 0' }}>Team not found</p>;
  }

  const isOwner = team.role === 'owner';
  const selectStyle: React.CSSProperties = {
    padding: '0.35rem 0.5rem', background: 'var(--btn-secondary-bg)',
    border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)',
    color: 'var(--txt-pure)', fontSize: '0.8rem', outline: 'none',
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>{team.name}</h1>
      <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.85rem' }}>
        Slug: {team.slug} &middot; Your role: {team.role}
      </p>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0 0 1rem' }}>{error}</p>}

      {/* Members */}
      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--txt-pure)', margin: '0 0 1rem' }}>Members ({members.length})</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
        {members.map((m) => (
          <div key={m.userId} style={{
            padding: '0.75rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--txt-pure)' }}>
                {m.nickname || m.email || m.userId}
              </span>
              {m.email && m.nickname && (
                <span style={{ fontSize: '0.78rem', color: 'var(--txt-muted)', marginLeft: '0.5rem' }}>{m.email}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isOwner ? (
                <select value={m.role} onChange={(e) => handleRoleChange(m.userId, e.target.value)} style={selectStyle}>
                  <option value="owner">Owner</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span style={{ fontSize: '0.8rem', color: 'var(--txt-muted)', textTransform: 'capitalize' }}>{m.role}</span>
              )}
              {isOwner && members.length > 1 && (
                <button onClick={() => handleRemoveMember(m.userId)} style={{
                  background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem',
                }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite */}
      {(isOwner || team.role === 'member') && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--txt-pure)', margin: '0 0 1rem' }}>Invite Member</h2>
          <form onSubmit={handleInvite} style={{
            padding: '1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '12px', marginBottom: '2rem',
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--txt-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@example.com" required style={{
                  width: '100%', padding: '0.5rem 0.75rem', background: 'var(--btn-secondary-bg)',
                  border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)',
                  color: 'var(--txt-pure)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                }} />
              </div>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'viewer')} style={selectStyle}>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" disabled={actionLoading} style={{
                padding: '0.5rem 1rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.85rem',
                cursor: actionLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              }}>
                {actionLoading ? 'Sending...' : 'Invite'}
              </button>
            </div>

            {inviteLink && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(var(--signature-rgb), 0.07)', borderRadius: 'var(--r-sm)', wordBreak: 'break-all' }}>
                <p style={{ margin: '0 0 0.3rem', fontSize: '0.78rem', color: 'var(--txt-muted)' }}>Share this link with the invitee:</p>
                <code style={{ fontSize: '0.82rem', color: 'var(--signature)' }}>{inviteLink}</code>
              </div>
            )}
          </form>
        </>
      )}

      {/* Danger zone */}
      {isOwner && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--danger)', margin: '0 0 1rem' }}>Danger Zone</h2>
          <div style={{
            padding: '1rem 1.25rem', background: 'var(--bg-card)',
            border: '1px solid var(--danger)', borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--txt-pure)' }}>Delete this team</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--txt-muted)' }}>All projects and data will be permanently deleted.</p>
            </div>
            <button onClick={handleDeleteTeam} style={{
              padding: '0.5rem 1rem', background: 'var(--danger)', color: '#fff',
              border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
            }}>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

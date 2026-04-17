'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import RecgonLogo from '@/components/RecgonLogo';
import { useTeam } from '@/components/TeamProvider';

interface InviteInfo {
  teamName: string;
  role: string;
  email: string | null;
  expired: boolean;
}

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const { refreshTeams } = useTeam();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/teams/invite/accept?token=${token}`);
        if (res.ok) {
          setInvite(await res.json());
        } else {
          setError('This invitation is invalid or has expired.');
        }
      } catch {
        setError('Failed to load invitation.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError('');

    try {
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
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  }

  const inviteCallback = `/teams/invite/${token}`;
  const encodedCallback = encodeURIComponent(inviteCallback);

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '380px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem' }}>
          <RecgonLogo size={28} uid="logo-invite" />
          <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--signature)', letterSpacing: '-0.3px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Recgon</span>
        </div>

        {loading && <p style={{ color: 'var(--txt-muted)' }}>Loading invitation...</p>}

        {!loading && error && !invite && (
          <p style={{ color: 'var(--danger)', fontSize: '0.95rem' }}>{error}</p>
        )}

        {!loading && invite && !invite.expired && (
          <>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.5rem' }}>
              You&apos;re invited to join
            </h1>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--signature)', margin: '0 0 0.5rem' }}>
              {invite.teamName}
            </p>
            <p style={{ color: 'var(--txt-muted)', fontSize: '0.875rem', margin: '0 0 2rem' }}>
              as a <strong style={{ color: 'var(--txt-pure)' }}>{invite.role}</strong>
            </p>
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0 0 1rem' }}>{error}</p>}
            {session?.user ? (
              <button onClick={handleAccept} disabled={accepting} style={{
                padding: '0.75rem 2rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '1rem',
                cursor: accepting ? 'not-allowed' : 'pointer', opacity: accepting ? 0.7 : 1,
              }}>
                {accepting ? 'Joining...' : 'Accept Invitation'}
              </button>
            ) : status === 'unauthenticated' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', margin: '0 0 0.25rem' }}>
                  Sign in or create an account to join — you&apos;ll come right back here.
                </p>
                <a
                  href={`/login?callbackUrl=${encodedCallback}`}
                  style={{
                    padding: '0.7rem 1.5rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                    borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem',
                    textDecoration: 'none', textAlign: 'center',
                  }}
                >
                  Sign in
                </a>
                <a
                  href={`/register?callbackUrl=${encodedCallback}`}
                  style={{
                    padding: '0.7rem 1.5rem', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)',
                    border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)',
                    fontWeight: 600, fontSize: '0.95rem',
                    textDecoration: 'none', textAlign: 'center',
                  }}
                >
                  Create account
                </a>
              </div>
            ) : null}
          </>
        )}

        {!loading && invite?.expired && (
          <p style={{ color: 'var(--danger)', fontSize: '0.95rem' }}>This invitation has expired.</p>
        )}
      </div>
    </div>
  );
}

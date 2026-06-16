'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import RecgonLogo from '@/components/RecgonLogo';
import { useTeam } from '@/components/TeamProvider';
import { Button, Skeleton } from '@/components/ui';

interface InviteInfo {
  teamName: string;
  role: string;
  email: string | null;
  expired: boolean;
}

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations('teams');
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
          setError(t('invite.invalidOrExpired'));
        }
      } catch {
        setError(t('invite.loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, t]);

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
      setError(err instanceof Error ? err.message : t('invite.acceptFailed'));
    } finally {
      setAccepting(false);
    }
  }

  const inviteCallback = `/teams/invite/${token}`;
  const encodedCallback = encodeURIComponent(inviteCallback);

  return (
    <div className="iv-page">
      <div className="iv-col">
        <div className="iv-brand">
          <RecgonLogo size={28} uid="logo-invite" />
          <span className="iv-brand-name">Recgon</span>
        </div>

        {loading && (
          <div className="iv-loading" aria-busy="true">
            <Skeleton width="70%" height={18} radius={4} />
            <Skeleton width="45%" height={24} radius={4} />
            <Skeleton width="55%" height={12} radius={4} />
            <span className="iv-visually-hidden">{t('invite.loading')}</span>
          </div>
        )}

        {!loading && error && !invite && (
          <p role="alert" className="iv-error">{error}</p>
        )}

        {!loading && invite && !invite.expired && (
          <>
            <h1 className="iv-title">
              {t('invite.invitedToJoin')}
            </h1>
            <p className="iv-team">
              {invite.teamName}
            </p>
            <p className="iv-role">
              {t.rich('invite.asRole', { role: t(`roles.${invite.role}`), strong: (chunks) => <strong style={{ color: 'var(--txt-pure)' }}>{chunks}</strong> })}
            </p>
            {error && <p role="alert" className="iv-error iv-error-inline">{error}</p>}
            {session?.user ? (
              <Button variant="primary" loading={accepting} className="iv-cta" onClick={handleAccept}>
                {accepting ? t('invite.joining') : t('invite.accept')}
              </Button>
            ) : status === 'unauthenticated' ? (
              <div className="iv-actions">
                <p className="iv-prompt">
                  {t('invite.signInPrompt')}
                </p>
                <Button asChild variant="primary" className="iv-cta">
                  <Link href={`/login?callbackUrl=${encodedCallback}`}>
                    {t('invite.signIn')}
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="iv-cta">
                  <Link href={`/register?callbackUrl=${encodedCallback}`}>
                    {t('invite.createAccount')}
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}

        {!loading && invite?.expired && (
          <p role="alert" className="iv-error">{t('invite.expired')}</p>
        )}
      </div>
      <style>{inviteStyles}</style>
    </div>
  );
}

const inviteStyles = `
  .iv-page {
    width: 100vw;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .iv-col {
    width: min(400px, 100%);
    text-align: center;
  }
  .iv-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 32px;
  }
  .iv-brand-name {
    font-weight: 700;
    font-size: 20px;
    color: var(--signature);
    letter-spacing: -0.3px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }
  .iv-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .iv-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .iv-error { color: var(--danger); font-size: 14px; }
  .iv-error-inline { font-size: 13px; margin: 0 0 16px; }
  .iv-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--txt-pure);
    margin: 0 0 8px;
  }
  .iv-team {
    font-size: 24px;
    font-weight: 700;
    color: var(--signature);
    margin: 0 0 8px;
  }
  .iv-role {
    color: var(--txt-muted);
    font-size: 14px;
    margin: 0 0 32px;
  }
  .iv-cta {
    width: 100%;
    justify-content: center;
  }
  .iv-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .iv-prompt {
    color: var(--txt-muted);
    font-size: 13px;
    margin: 0 0 4px;
  }
`;

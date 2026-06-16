'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import RecgonLogo from '@/components/RecgonLogo';
import { useTeam } from '@/components/TeamProvider';
import { Button, FormField } from '@/components/ui';

const NAME_MIN = 2;

export default function TeamSetupPage() {
  const t = useTranslations('teams');
  const tv = useTranslations('auth');
  const router = useRouter();
  const { refreshTeams } = useTeam();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [teamName, setTeamName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [nameError, setNameError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  function validateName(): string {
    if (teamName.trim().length < NAME_MIN) return tv('validation.teamNameMin', { min: NAME_MIN });
    return '';
  }
  function validateToken(): string {
    if (!inviteToken.trim()) return tv('validation.tokenRequired');
    return '';
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const nErr = validateName();
    setNameError(nErr);
    if (nErr) { nameRef.current?.focus(); return; }
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
      setError(err instanceof Error ? err.message : t('setup.createFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const tErr = validateToken();
    setTokenError(tErr);
    if (tErr) { tokenRef.current?.focus(); return; }
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
      setError(err instanceof Error ? err.message : t('setup.joinFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ts-page">
      <div className="ts-col">
        <div className="ts-brand">
          <RecgonLogo size={28} uid="logo-team-setup" />
          <span className="ts-brand-name">Recgon</span>
        </div>

        {mode === 'choose' && (
          <>
            <h1 className="ts-title">{t('setup.choose.title')}</h1>
            <p className="ts-sub">
              {t('setup.choose.subtitle')}
            </p>

            <div className="ts-choices">
              <Button variant="primary" className="ts-full" onClick={() => setMode('create')}>
                {t('setup.choose.createButton')}
              </Button>
              <Button variant="secondary" className="ts-full" onClick={() => setMode('join')}>
                {t('setup.choose.joinButton')}
              </Button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <h1 className="ts-title">{t('setup.create.title')}</h1>
            <p className="ts-sub">
              {t('setup.create.subtitle')}
            </p>

            <form onSubmit={handleCreate} className="ts-form" noValidate>
              <FormField label={t('setup.create.nameLabel')} htmlFor="ts-name" error={nameError || undefined} required>
                <input
                  ref={nameRef}
                  className="ui-input"
                  type="text"
                  autoFocus
                  value={teamName}
                  onChange={(e) => { setTeamName(e.target.value); if (nameError) setNameError(''); }}
                  onBlur={() => setNameError(validateName())}
                  placeholder={t('setup.create.namePlaceholder')}
                />
              </FormField>
              {error && <div role="alert" className="ts-alert">{error}</div>}
              <Button type="submit" variant="primary" loading={loading} className="ts-full">
                {loading ? t('setup.create.creating') : t('setup.create.submit')}
              </Button>
              <Button type="button" variant="secondary" className="ts-full" onClick={() => { setMode('choose'); setError(''); }}>
                {t('setup.back')}
              </Button>
            </form>
          </>
        )}

        {mode === 'join' && (
          <>
            <h1 className="ts-title">{t('setup.join.title')}</h1>
            <p className="ts-sub">
              {t('setup.join.subtitle')}
            </p>

            <form onSubmit={handleJoin} className="ts-form" noValidate>
              <FormField label={t('setup.join.tokenLabel')} htmlFor="ts-token" error={tokenError || undefined} required>
                <input
                  ref={tokenRef}
                  className="ui-input"
                  type="text"
                  autoFocus
                  value={inviteToken}
                  onChange={(e) => { setInviteToken(e.target.value); if (tokenError) setTokenError(''); }}
                  onBlur={() => setTokenError(validateToken())}
                  placeholder={t('setup.join.tokenPlaceholder')}
                />
              </FormField>
              {error && <div role="alert" className="ts-alert">{error}</div>}
              <Button type="submit" variant="primary" loading={loading} className="ts-full">
                {loading ? t('setup.join.joining') : t('setup.join.submit')}
              </Button>
              <Button type="button" variant="secondary" className="ts-full" onClick={() => { setMode('choose'); setError(''); }}>
                {t('setup.back')}
              </Button>
            </form>
          </>
        )}
      </div>
      <style>{teamSetupStyles}</style>
    </div>
  );
}

const teamSetupStyles = `
  .ts-page {
    width: 100vw;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .ts-col { width: min(400px, 100%); }
  .ts-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 32px;
  }
  .ts-brand-name {
    font-weight: 700;
    font-size: 20px;
    color: var(--signature);
    letter-spacing: -0.3px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }
  .ts-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--txt-pure);
    margin: 0 0 6px;
    letter-spacing: -0.3px;
  }
  .ts-sub {
    color: var(--txt-muted);
    margin: 0 0 32px;
    font-size: 14px;
  }
  .ts-choices,
  .ts-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ts-form { gap: 16px; }
  .ts-full { width: 100%; }
  .ts-alert {
    padding: 10px 12px;
    background: rgba(var(--danger-rgb), 0.08);
    border: 1px solid rgba(var(--danger-rgb), 0.3);
    border-radius: var(--r-sm);
    color: var(--danger);
    font-size: 13px;
    margin: 0;
  }
`;

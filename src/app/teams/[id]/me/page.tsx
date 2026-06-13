// Phase 1 / Plan 01-03, redesigned 2026-05-12. RSC entry for the
// teammate self-profile page. Auth-gates, loads profile + team, then
// hands off to ProfilePageClient (the two-column wrapper that holds
// the lifted form state).

import { auth } from '@/auth';
import { getTranslations } from 'next-intl/server';
import { redirect, notFound } from 'next/navigation';
import { verifyTeamAccess, getTeam } from '@/lib/teamStorage';
import { getProfile } from '@/lib/recgon/profileStorage';
import {
  listInferredSkills,
  getTeammateByTeamUser,
  getMiningStatus,
} from '@/lib/recgon/inferredSkillsStorage';
import { getUserById } from '@/lib/userStorage';
import { CANONICAL_VOCAB } from '@/lib/recgon/skillVocabulary';
import ProfilePageClient from './ProfilePageClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  const t = await getTranslations('teams');
  const { id: teamId } = await params;

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role === null) {
    notFound();
  }

  const [profile, team, teammate, mining, userRow] = await Promise.all([
    getProfile(teamId, session.user.id),
    getTeam(teamId),
    getTeammateByTeamUser(teamId, session.user.id),
    getMiningStatus(teamId, session.user.id),
    getUserById(session.user.id),
  ]);

  // Phase 2 / Plan 02-03: feed the right-rail "INFERRED FROM GITHUB" + consent
  // section initial state from the server. Defensive: if no teammate row,
  // return empty list (the API does the same on cross-team/no-teammate).
  const inferredSkills = teammate
    ? await listInferredSkills(teammate.id)
    : [];

  const user = {
    nickname: session.user.nickname ?? null,
    email: session.user.email ?? null,
    avatarUrl: (session.user as { avatarUrl?: string }).avatarUrl ?? null,
  };

  return (
    <div className="profile-shell">
      <header className="profile-shell__head">
        <div className="profile-shell__eyebrow">{t('profile.eyebrow')}</div>
        <h1 className="profile-shell__title">{t('profile.title')}</h1>
        <div aria-hidden="true" className="profile-shell__rule" />
        <p className="profile-shell__lede">
          {t('profile.lede')}
        </p>
      </header>

      <ProfilePageClient
        teamId={teamId}
        initialProfile={profile}
        canonicalVocab={[...CANONICAL_VOCAB]}
        user={user}
        teamName={team?.name ?? t('profile.yourTeamFallback')}
        initialInferredSkills={inferredSkills}
        initialConsentedAt={mining?.githubMiningConsentAt ?? null}
        initialLastScanAt={mining?.lastScanAt ?? null}
        githubUsername={userRow?.githubUsername ?? null}
      />

      <style>{`
        .profile-shell {
          max-width: 1080px;
          margin: 0 auto;
          padding: 56px 32px 0;
        }
        @media (max-width: 720px) {
          .profile-shell { padding: 32px 20px 0; }
        }
        .profile-shell__head {
          margin-bottom: 40px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .profile-shell__eyebrow {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.14em;
          color: var(--txt-faint);
        }
        .profile-shell__title {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 30px;
          font-weight: 600;
          line-height: 1.15;
          color: var(--txt-pure);
          margin: 0;
        }
        .profile-shell__rule {
          width: 56px;
          height: 1px;
          background: linear-gradient(
            90deg,
            var(--signature) 0%,
            rgba(var(--signature-rgb), 0) 100%
          );
          margin-top: 4px;
        }
        .profile-shell__lede {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 15px;
          line-height: 1.55;
          color: var(--txt-muted);
          margin: 6px 0 0;
          max-width: 56ch;
        }
      `}</style>
    </div>
  );
}

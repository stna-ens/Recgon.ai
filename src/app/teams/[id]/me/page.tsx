// Phase 1 / Plan 01-03, redesigned 2026-05-12. RSC entry for the
// teammate self-profile page. Auth-gates, loads profile + team, then
// hands off to ProfilePageClient (the two-column wrapper that holds
// the lifted form state).

import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { verifyTeamAccess, getTeam } from '@/lib/teamStorage';
import { getProfile } from '@/lib/recgon/profileStorage';
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
  const { id: teamId } = await params;

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role === null) {
    notFound();
  }

  const [profile, team] = await Promise.all([
    getProfile(teamId, session.user.id),
    getTeam(teamId),
  ]);

  const user = {
    nickname: session.user.nickname ?? null,
    email: session.user.email ?? null,
    avatarUrl: (session.user as { avatarUrl?: string }).avatarUrl ?? null,
  };

  return (
    <div className="profile-shell">
      <header className="profile-shell__head">
        <div className="profile-shell__eyebrow">YOUR PROFILE</div>
        <h1 className="profile-shell__title">Tell me what you do</h1>
        <div aria-hidden="true" className="profile-shell__rule" />
        <p className="profile-shell__lede">
          What you put here is what I&apos;ll use to pick which task lands on your desk. The
          preview on the right updates as you go.
        </p>
      </header>

      <ProfilePageClient
        teamId={teamId}
        initialProfile={profile}
        canonicalVocab={[...CANONICAL_VOCAB]}
        user={user}
        teamName={team?.name ?? 'your team'}
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
          font-size: 10.5px;
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

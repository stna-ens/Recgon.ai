// Phase 1 / Plan 01-03. The teammate self-profile page.
//
// Server component: gates on auth + verifyTeamAccess, then loads the user's
// own profile and hands it to the client form. No Supabase imports leak to
// the browser bundle — all DB access stays here or in the API route.

import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getProfile } from '@/lib/recgon/profileStorage';
import { CANONICAL_VOCAB } from '@/lib/recgon/skillVocabulary';
import ProfileForm from './ProfileForm';

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

  const profile = await getProfile(teamId, session.user.id);

  return (
    <div
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '48px 24px 64px',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-inter), Inter, sans-serif',
          fontSize: '28px',
          fontWeight: 600,
          lineHeight: 1.2,
          color: 'var(--txt-pure)',
          marginBottom: '8px',
        }}
      >
        Your profile
      </h1>
      <div
        aria-hidden="true"
        style={{
          width: '64px',
          height: '1px',
          background: 'rgba(var(--signature-rgb), 0.4)',
          marginBottom: '12px',
        }}
      />
      <p
        style={{
          fontFamily: 'var(--font-inter), Inter, sans-serif',
          fontSize: '16px',
          fontWeight: 400,
          lineHeight: 1.5,
          color: 'var(--txt-muted)',
          marginBottom: '48px',
        }}
      >
        What you tell me here is what I&apos;ll use to assign you tasks.
      </p>

      <div className="glass-card" style={{ padding: '32px', borderRadius: 'var(--r-md)' }}>
        <ProfileForm
          teamId={teamId}
          initialProfile={profile}
          canonicalVocab={[...CANONICAL_VOCAB]}
        />
      </div>

      <section
        className="glass-card"
        tabIndex={-1}
        aria-disabled="true"
        style={{
          marginTop: '32px',
          padding: '24px 32px',
          borderRadius: 'var(--r-md)',
          minHeight: '96px',
          opacity: 0.55,
          pointerEvents: 'none',
          filter: 'saturate(0.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '8px',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-inter), Inter, sans-serif',
              fontSize: '20px',
              fontWeight: 600,
              lineHeight: 1.3,
              color: 'var(--txt-pure)',
              margin: 0,
            }}
          >
            What GitHub will say about you
          </h2>
          <span
            className="recgon-label"
            style={{
              fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 10px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--btn-secondary-bg)',
              color: 'var(--txt-muted)',
              border: '1px solid var(--btn-secondary-border)',
            }}
          >
            COMING SOON
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-inter), Inter, sans-serif',
            fontSize: '16px',
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'var(--txt-muted)',
            margin: 0,
          }}
        >
          Once you connect a repo, I&apos;ll look at what you actually ship and add it here.
          You&apos;ll get to confirm or reject each one.
        </p>
      </section>
    </div>
  );
}

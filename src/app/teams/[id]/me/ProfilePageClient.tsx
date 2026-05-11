'use client';

// Phase 1 (UAT redesign, 2026-05-12). Two-column profile editor:
// - LEFT: ProfileFormFields (controlled — receives state/setters from here)
// - RIGHT: ProfilePreview (live read-only "how Recgon sees you")
// State is lifted here so both panels stay in sync without a context.

import { useMemo, useState, useTransition } from 'react';
import type { TeammateProfile } from '@/lib/recgon/types';
import ProfileFormFields, { type PillEntry } from './ProfileForm';
import ProfilePreview from './ProfilePreview';

interface Props {
  teamId: string;
  initialProfile: TeammateProfile | null;
  canonicalVocab: string[];
  user: {
    nickname: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  teamName: string;
}

type SaveOutcome =
  | { kind: 'success'; degraded: boolean }
  | { kind: 'error'; message: string };

function zipEntries(raw: string[], canonical: string[]): PillEntry[] {
  return raw.map((r) => ({ raw: r, canonical: canonical.includes(r) ? [r] : [] }));
}

function entriesEqual(a: PillEntry[], b: PillEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].raw !== b[i].raw) return false;
  }
  return true;
}

export default function ProfilePageClient({
  teamId,
  initialProfile,
  canonicalVocab,
  user,
  teamName,
}: Props) {
  const initial = useMemo(
    () => ({
      skills: zipEntries(initialProfile?.skillsRaw ?? [], initialProfile?.skillsCanonical ?? []),
      strengths: zipEntries(
        initialProfile?.strengthsRaw ?? [],
        initialProfile?.strengthsCanonical ?? [],
      ),
      interests: zipEntries(
        initialProfile?.interestsRaw ?? [],
        initialProfile?.interestsCanonical ?? [],
      ),
      capacity: initialProfile?.weeklyCapacityHours ?? null,
    }),
    [initialProfile],
  );

  const [skills, setSkills] = useState<PillEntry[]>(initial.skills);
  const [strengths, setStrengths] = useState<PillEntry[]>(initial.strengths);
  const [interests, setInterests] = useState<PillEntry[]>(initial.interests);
  const [capacity, setCapacity] = useState<number | null>(initial.capacity);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = useMemo(
    () =>
      !entriesEqual(skills, initial.skills) ||
      !entriesEqual(strengths, initial.strengths) ||
      !entriesEqual(interests, initial.interests) ||
      capacity !== initial.capacity,
    [skills, strengths, interests, capacity, initial],
  );

  function handleSave() {
    setOutcome(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/profile`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            skillsRaw: skills.map((p) => p.raw),
            strengthsRaw: strengths.map((p) => p.raw),
            interestsRaw: interests.map((p) => p.raw),
            weeklyCapacityHours: capacity,
          }),
        });
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            setOutcome({
              kind: 'error',
              message: json.error ?? 'Add at least one skill before saving.',
            });
          } else {
            setOutcome({ kind: 'error', message: "Couldn't save just now. Try again." });
          }
          return;
        }
        const json = (await res.json()) as {
          ok: boolean;
          normalization: {
            skills: PillEntry[];
            strengths: PillEntry[];
            interests: PillEntry[];
            degraded: boolean;
          };
        };
        setSkills(json.normalization.skills);
        setStrengths(json.normalization.strengths);
        setInterests(json.normalization.interests);
        setOutcome({ kind: 'success', degraded: json.normalization.degraded });
      } catch {
        setOutcome({ kind: 'error', message: "Couldn't save just now. Try again." });
      }
    });
  }

  return (
    <>
      <div className="profile-page">
        <main className="profile-page__main">
          <ProfileFormFields
            canonicalVocab={canonicalVocab}
            skills={skills}
            setSkills={setSkills}
            strengths={strengths}
            setStrengths={setStrengths}
            interests={interests}
            setInterests={setInterests}
            capacity={capacity}
            setCapacity={setCapacity}
          />
        </main>

        <aside className="profile-page__rail" aria-label="profile preview">
          <div className="profile-page__rail-stick">
            <ProfilePreview
              user={user}
              teamName={teamName}
              skills={skills}
              strengths={strengths}
              interests={interests}
              capacity={capacity}
            />
          </div>
        </aside>
      </div>

      {/* Sticky save bar */}
      <div className="profile-savebar">
        <div className="profile-savebar__inner">
          <div className="profile-savebar__status">
            {outcome ? (
              <span className={`profile-savebar__msg profile-savebar__msg--${outcome.kind === 'success' ? 'ok' : 'err'}`}>
                {outcome.kind === 'success'
                  ? outcome.degraded
                    ? "Saved. I'll re-match the canonical tags next time the LLM is reachable."
                    : 'Saved. Recgon will use this on the next run.'
                  : outcome.message}
              </span>
            ) : isDirty ? (
              <span className="profile-savebar__msg profile-savebar__msg--dirty">
                <span className="profile-savebar__dot" aria-hidden="true" />
                Unsaved changes
              </span>
            ) : (
              <span className="profile-savebar__msg profile-savebar__msg--clean">All changes saved</span>
            )}
          </div>
          <button
            type="button"
            className="profile-savebar__btn"
            onClick={handleSave}
            disabled={isPending || (!isDirty && outcome?.kind !== 'error')}
          >
            {isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>

      <style>{`
        .profile-page {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 268px;
          gap: 36px;
          align-items: start;
          padding-bottom: 96px;
        }
        @media (max-width: 1100px) {
          .profile-page { grid-template-columns: minmax(0, 1fr) 232px; gap: 28px; }
        }
        @media (max-width: 880px) {
          .profile-page {
            grid-template-columns: 1fr;
            gap: 22px;
          }
        }
        .profile-page__rail {
          min-width: 0;
          animation: profile-rail-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: 80ms;
        }
        @keyframes profile-rail-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: none; }
        }
        .profile-page__rail-stick {
          position: sticky;
          top: 96px;
          padding: 4px;
        }
        @media (max-width: 880px) {
          .profile-page__rail-stick {
            position: static;
            padding: 0;
          }
        }
        .profile-page__main {
          min-width: 0;
        }

        .profile-savebar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 50;
          background: color-mix(in oklab, var(--bg-deep, #0a0a0c) 92%, transparent);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border-top: 1px solid var(--btn-secondary-border);
        }
        .profile-savebar__inner {
          max-width: 1080px;
          margin: 0 auto;
          padding: 14px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        @media (max-width: 720px) {
          .profile-savebar__inner { padding: 12px 20px; }
        }
        .profile-savebar__status { flex: 1; min-width: 0; }
        .profile-savebar__msg {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13.5px;
          line-height: 1.4;
        }
        .profile-savebar__msg--clean { color: var(--txt-faint); }
        .profile-savebar__msg--dirty { color: var(--signature); }
        .profile-savebar__msg--ok { color: var(--txt-muted); }
        .profile-savebar__msg--err { color: var(--danger, #f87171); }
        .profile-savebar__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--signature);
          box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.18);
          animation: profile-savebar-pulse 1.6s ease-in-out infinite;
        }
        @keyframes profile-savebar-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.18); }
          50%      { box-shadow: 0 0 0 6px rgba(var(--signature-rgb), 0.32); }
        }
        .profile-savebar__btn {
          padding: 10px 22px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: white;
          background: var(--signature);
          border: none;
          border-radius: var(--r-sm);
          cursor: pointer;
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .profile-savebar__btn:hover:not(:disabled) { opacity: 0.92; }
        .profile-savebar__btn:active:not(:disabled) { transform: translateY(1px); }
        .profile-savebar__btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}

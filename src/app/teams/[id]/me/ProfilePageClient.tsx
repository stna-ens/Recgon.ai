'use client';

// Phase 1 (UAT redesign, 2026-05-12). Two-column profile editor:
// - LEFT: ProfileFormFields (controlled — receives state/setters from here)
// - RIGHT: ProfilePreview (live read-only "how Recgon sees you")
// State is lifted here so both panels stay in sync without a context.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { InferredSkill, TeammateProfile } from '@/lib/recgon/types';
import ProfileFormFields, { type PillEntry } from './ProfileForm';
import ProfilePreview from './ProfilePreview';
import InferredFromGitHub from './InferredFromGitHub';
import GithubConsentSection from './GithubConsentSection';
import ReviewBanner from './ReviewBanner';
import { useToast } from '@/components/Toast';

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
  // Phase 2 / Plan 02-03: server-side initial data so the UI lands hydrated
  // (matches Phase 1 P03 SUMMARY's initial-data pattern).
  initialInferredSkills?: InferredSkill[];
  initialConsentedAt?: string | null;
  initialLastScanAt?: string | null;
  githubUsername?: string | null;
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
  initialInferredSkills = [],
  initialConsentedAt = null,
  initialLastScanAt = null,
  githubUsername = null,
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

  // Phase 2 / Plan 02-03 state.
  const [inferredSkills, setInferredSkills] =
    useState<InferredSkill[]>(initialInferredSkills);
  const [consentedAt, setConsentedAt] = useState<string | null>(initialConsentedAt);
  const [lastScanAt, setLastScanAt] = useState<string | null>(initialLastScanAt);
  const [isScanning, setIsScanning] = useState(false);
  const [rescanRateLimitedUntil, setRescanRateLimitedUntil] = useState<
    number | null
  >(null);
  const { addToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Per-skill timers for the 6-second undo window. Keyed by skillId. The
  // optimistic state lives inside InferredFromGitHub; this page only fires
  // the PATCH after the undo window closes (or immediately if the user
  // declines undo by ignoring the toast).
  const undoTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const undoUsedRef = useRef<Set<string>>(new Set());

  const unreviewedCount = useMemo(
    () =>
      inferredSkills.filter(
        (s) => !s.userReviewedAt && !s.rejectedAt,
      ).length,
    [inferredSkills],
  );

  // On return from the OAuth round-trip, surface a toast and clean the URL.
  useEffect(() => {
    const flag = searchParams.get('github_skill_mining');
    if (!flag) return;
    if (flag === 'connected') {
      setConsentedAt((prev) => prev ?? new Date().toISOString());
      addToast(
        "Connected. I'll start looking at your commits — first results land in a moment.",
        'success',
      );
    } else if (flag === 'failed') {
      addToast('Couldn\'t connect to GitHub. Try again in a moment.', 'error');
    }
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReject(skillId: string) {
    // Optimistic update is owned by InferredFromGitHub — we only need to
    // record the eventual PATCH after the 6-second undo window.
    // Cancel any existing pending timer for this id (re-clicking shouldn't
    // queue two PATCHes).
    const existing = undoTimersRef.current.get(skillId);
    if (existing) clearTimeout(existing);
    undoUsedRef.current.delete(skillId);

    addToast("Dropped. I won't suggest it again.", 'info');

    const timer = setTimeout(async () => {
      undoTimersRef.current.delete(skillId);
      if (undoUsedRef.current.has(skillId)) return;
      try {
        const res = await fetch(
          `/api/teams/${teamId}/inferred-skills/${skillId}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rejected: true }),
          },
        );
        if (!res.ok) throw new Error('patch failed');
        const json = (await res.json()) as { inferredSkill: InferredSkill };
        setInferredSkills((prev) =>
          prev.map((s) => (s.id === skillId ? json.inferredSkill : s)),
        );
      } catch {
        addToast("Couldn't update. Try again in a moment.", 'error');
        // Re-syncing the optimistic state in the child is a follow-up. For
        // now the toast tells the user to retry.
      }
    }, 6000);
    undoTimersRef.current.set(skillId, timer);
  }

  async function handleUndoReject(skillId: string) {
    undoUsedRef.current.add(skillId);
    const t = undoTimersRef.current.get(skillId);
    if (t) {
      clearTimeout(t);
      undoTimersRef.current.delete(skillId);
    }
    try {
      const res = await fetch(
        `/api/teams/${teamId}/inferred-skills/${skillId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rejected: false }),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as { inferredSkill: InferredSkill };
        setInferredSkills((prev) =>
          prev.map((s) => (s.id === skillId ? json.inferredSkill : s)),
        );
      }
    } catch {
      addToast("Couldn't update. Try again in a moment.", 'error');
    }
  }

  async function handleRescan() {
    if (isScanning) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/inferred-skills/scan`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.status === 429) {
        const json = (await res.json().catch(() => ({}))) as {
          retryAfterMin?: number;
        };
        const min = json.retryAfterMin ?? 60;
        setRescanRateLimitedUntil(Date.now() + min * 60_000);
        addToast(`Already scanned recently. Try again in ${min}m.`, 'info');
        return;
      }
      if (!res.ok) {
        addToast("Couldn't queue a scan. Try again in a moment.", 'error');
        return;
      }
      setIsScanning(true);
      addToast('Scan queued. New skills will land in a moment.', 'info');
      // TODO(follow-up): poll the job + refetch list when status = succeeded.
      // For now the user can refresh the page once the scan completes; the
      // pulse animation indicates a scan is in flight.
    } catch {
      addToast("Couldn't queue a scan. Try again in a moment.", 'error');
    }
  }

  async function handleConnect() {
    try {
      const res = await fetch(
        `/api/teams/${teamId}/inferred-skills/consent`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) {
        addToast("Couldn't start GitHub connect. Try again.", 'error');
        return;
      }
      const json = (await res.json()) as { redirectUrl: string };
      window.location.assign(json.redirectUrl);
    } catch {
      addToast("Couldn't start GitHub connect. Try again.", 'error');
    }
  }

  async function handleStopMining() {
    try {
      const res = await fetch(
        `/api/teams/${teamId}/inferred-skills/consent`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        addToast("Couldn't disconnect. Try again in a moment.", 'error');
        return;
      }
      setConsentedAt(null);
      addToast("Stopped. I'll keep the skills you've accepted.", 'success');
    } catch {
      addToast("Couldn't disconnect. Try again in a moment.", 'error');
    }
  }

  async function handleDismissBanner() {
    // Optimistic UI: mark every currently-unreviewed row as reviewed.
    const nowIso = new Date().toISOString();
    setInferredSkills((prev) =>
      prev.map((s) =>
        s.userReviewedAt || s.rejectedAt ? s : { ...s, userReviewedAt: nowIso },
      ),
    );
    try {
      const res = await fetch(
        `/api/teams/${teamId}/inferred-skills/mark-reviewed`,
        { method: 'PATCH', credentials: 'include' },
      );
      if (!res.ok) {
        addToast("Couldn't dismiss banner. Try again.", 'error');
      }
    } catch {
      addToast("Couldn't dismiss banner. Try again.", 'error');
    }
  }

  function handleReviewBannerClick() {
    if (typeof document === 'undefined') return;
    document
      .getElementById('inferred-from-github-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Mark lastScanAt setter as intentionally unused for now — the polling
  // follow-up (TODO above) will be the only writer.
  void setLastScanAt;

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
          <ReviewBanner
            count={unreviewedCount}
            onReview={handleReviewBannerClick}
            onDismiss={handleDismissBanner}
          />
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
            consentSection={
              <GithubConsentSection
                githubUsername={githubUsername}
                consentedAt={consentedAt}
                onConnect={handleConnect}
                onStopMining={handleStopMining}
              />
            }
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
              inferredSection={
                <InferredFromGitHub
                  items={inferredSkills}
                  lastScanAt={lastScanAt}
                  consented={consentedAt !== null}
                  isScanning={isScanning}
                  onReject={handleReject}
                  onUndoReject={handleUndoReject}
                  onRescan={handleRescan}
                  rescanRateLimitedUntil={rescanRateLimitedUntil}
                />
              }
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

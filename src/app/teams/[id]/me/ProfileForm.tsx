'use client';

// Phase 1 / Plan 01-03. The teammate self-profile form.
//
// 'use client' component — NEVER imports `@/lib/supabase`. All DB work
// happens server-side via fetch to `/api/teams/[id]/profile` (POST).
//
// Picker UX: free-text input with cmdk suggestion popover. Canonical vocab
// arrives as a serializable string array prop from the server. Each pill
// displays raw text on line 1 and `matched as canonical` on line 2 — per
// UI-SPEC: JetBrains Mono 12px / 400 / var(--txt-faint), with `matched as —`
// as the empty edge case (D-14).

import { useMemo, useState, useTransition } from 'react';
import { Command } from 'cmdk';
import * as Popover from '@radix-ui/react-popover';
import type { TeammateProfile } from '@/lib/recgon/types';
import { humanizeTag } from '@/lib/recgon/skillVocabulary';

type FieldKey = 'skills' | 'strengths' | 'interests';

type PillEntry = {
  raw: string;
  canonical: string[];
};

interface Props {
  teamId: string;
  initialProfile: TeammateProfile | null;
  canonicalVocab: string[];
}

type SaveOutcome =
  | { kind: 'success'; degraded: boolean }
  | { kind: 'error'; message: string };

const FIELD_LABEL: Record<FieldKey, string> = {
  skills: 'SKILLS',
  strengths: 'STRENGTHS',
  interests: 'INTERESTS',
};

const FIELD_HELPER: Record<FieldKey, string> = {
  skills:
    'Languages, frameworks, areas of expertise. Type and pick from suggestions, or add your own.',
  strengths:
    "What you're known for on a team. Counts the same as skills when I'm matching tasks.",
  interests:
    "What you'd lean into given the choice. I'll use this to break ties when two of you fit a task equally well.",
};

const FIELD_PLACEHOLDER: Record<FieldKey, string> = {
  skills: 'e.g. PostgreSQL, React, copywriting…',
  strengths: 'e.g. shipping fast, debugging hard bugs…',
  interests: 'e.g. design systems, growth experiments…',
};

function zipEntries(raw: string[], canonical: string[]): PillEntry[] {
  // Profile rows store raw + canonical as separate flat arrays. For
  // display, we approximate the mapping per-entry: the canonical array is
  // a deduplicated union across all raws, so individual `matched as`
  // lines can only show the canonical match present for that specific
  // raw — which we don't have on the read path. Render canonical : [] for
  // pre-existing entries on initial load; the form re-renders the per-
  // entry mapping after the next save when the API returns normalization
  // data.
  return raw.map((r) => ({ raw: r, canonical: canonical.includes(r) ? [r] : [] }));
}

export default function ProfileForm({ teamId, initialProfile, canonicalVocab }: Props) {
  const [skills, setSkills] = useState<PillEntry[]>(() =>
    zipEntries(
      initialProfile?.skillsRaw ?? [],
      initialProfile?.skillsCanonical ?? [],
    ),
  );
  const [strengths, setStrengths] = useState<PillEntry[]>(() =>
    zipEntries(
      initialProfile?.strengthsRaw ?? [],
      initialProfile?.strengthsCanonical ?? [],
    ),
  );
  const [interests, setInterests] = useState<PillEntry[]>(() =>
    zipEntries(
      initialProfile?.interestsRaw ?? [],
      initialProfile?.interestsCanonical ?? [],
    ),
  );
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState<number | null>(
    initialProfile?.weeklyCapacityHours ?? null,
  );

  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [isPending, startTransition] = useTransition();

  const fieldState: Record<FieldKey, [PillEntry[], (v: PillEntry[]) => void]> = {
    skills: [skills, setSkills],
    strengths: [strengths, setStrengths],
    interests: [interests, setInterests],
  };

  function addEntry(field: FieldKey, entry: PillEntry) {
    const [items, setter] = fieldState[field];
    if (items.some((p) => p.raw.toLowerCase() === entry.raw.toLowerCase())) return;
    setter([...items, entry]);
  }

  function removeEntry(field: FieldKey, raw: string) {
    const [items, setter] = fieldState[field];
    setter(items.filter((p) => p.raw !== raw));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            weeklyCapacityHours,
          }),
        });
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) {
            const json = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            setOutcome({
              kind: 'error',
              message: json.error ?? 'Add at least one skill before saving.',
            });
          } else {
            setOutcome({
              kind: 'error',
              message: "Couldn't save just now. Try again in a moment.",
            });
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
        setOutcome({
          kind: 'error',
          message: "Couldn't save just now. Try again in a moment.",
        });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {(Object.keys(FIELD_LABEL) as FieldKey[]).map((field) => {
        const [items] = fieldState[field];
        return (
          <FieldSection
            key={field}
            field={field}
            entries={items}
            canonicalVocab={canonicalVocab}
            query={activeField === field ? query : ''}
            onQueryChange={setQuery}
            isOpen={activeField === field}
            onOpenChange={(open) => {
              setActiveField(open ? field : null);
              if (!open) setQuery('');
            }}
            onAdd={(entry) => addEntry(field, entry)}
            onRemove={(raw) => removeEntry(field, raw)}
          />
        );
      })}

      <div style={{ marginBottom: '32px' }}>
        <label
          className="recgon-label"
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--txt-pure)',
            marginBottom: '8px',
          }}
          htmlFor="weeklyCapacityHours"
        >
          WEEKLY CAPACITY
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            id="weeklyCapacityHours"
            type="number"
            inputMode="numeric"
            min={0}
            max={168}
            step={1}
            value={weeklyCapacityHours ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setWeeklyCapacityHours(v === '' ? null : Number(v));
            }}
            style={{
              width: '80px',
              padding: '8px 12px',
              fontSize: '16px',
              fontFamily: 'var(--font-inter), Inter, sans-serif',
              color: 'var(--txt-pure)',
              background: 'var(--btn-secondary-bg)',
              border: '1px solid var(--btn-secondary-border)',
              borderRadius: 'var(--r-sm)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
              fontSize: '12px',
              color: 'var(--txt-muted)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            hours / week
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-inter), Inter, sans-serif',
            fontSize: '14px',
            color: 'var(--txt-muted)',
            marginTop: '6px',
          }}
        >
          How much time you have for new work in a typical week.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          paddingTop: '24px',
          borderTop: '1px solid var(--btn-secondary-border)',
        }}
      >
        {outcome && (
          <div
            role="status"
            style={{
              flex: 1,
              fontFamily: 'var(--font-inter), Inter, sans-serif',
              fontSize: '14px',
              color:
                outcome.kind === 'success'
                  ? 'var(--txt-muted)'
                  : 'var(--danger)',
              borderLeft:
                outcome.kind === 'success'
                  ? `3px solid var(--signature)`
                  : `3px solid var(--danger)`,
              padding: '8px 12px',
            }}
          >
            {outcome.kind === 'success'
              ? outcome.degraded
                ? "I'll save what you typed and match it next time. Anything wrong with how I read these? Edit and save again."
                : "Profile saved — Recgon will use this on the next run."
              : outcome.message}
          </div>
        )}
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: '12px 24px',
            background: 'var(--signature)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontFamily: 'var(--font-inter), Inter, sans-serif',
            fontSize: '16px',
            fontWeight: 600,
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
            transition: 'opacity 0.15s var(--ease-out)',
          }}
        >
          {isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

interface FieldSectionProps {
  field: FieldKey;
  entries: PillEntry[];
  canonicalVocab: string[];
  query: string;
  onQueryChange: (q: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: PillEntry) => void;
  onRemove: (raw: string) => void;
}

function FieldSection({
  field,
  entries,
  canonicalVocab,
  query,
  onQueryChange,
  isOpen,
  onOpenChange,
  onAdd,
  onRemove,
}: FieldSectionProps) {
  const matches = useMemo(
    () =>
      query.trim() === ''
        ? canonicalVocab.slice(0, 8)
        : canonicalVocab
            .filter((v) => v.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8),
    [canonicalVocab, query],
  );
  const isCustom =
    query.trim() !== '' &&
    !canonicalVocab.some((v) => v.toLowerCase() === query.trim().toLowerCase());

  return (
    <div style={{ marginBottom: '24px' }}>
      <label
        className="recgon-label"
        htmlFor={`${field}-input`}
        style={{
          display: 'block',
          fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
          fontSize: '12px',
          fontWeight: 500,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--txt-pure)',
          marginBottom: '8px',
        }}
      >
        {FIELD_LABEL[field]}
      </label>
      <p
        style={{
          fontFamily: 'var(--font-inter), Inter, sans-serif',
          fontSize: '14px',
          color: 'var(--txt-muted)',
          marginBottom: '12px',
        }}
      >
        {FIELD_HELPER[field]}
      </p>

      {entries.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          {entries.map((entry) => (
            <div
              key={entry.raw}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                gap: '2px',
                padding: '4px 8px 4px 12px',
                background: 'var(--btn-secondary-bg)',
                border: '1px solid var(--btn-secondary-border)',
                borderRadius: 'var(--r-sm)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-inter), Inter, sans-serif',
                  fontSize: '16px',
                  fontWeight: 400,
                  color: 'var(--txt-pure)',
                }}
              >
                <span>{humanizeTag(entry.raw)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${entry.raw}`}
                  onClick={() => onRemove(entry.raw)}
                  style={{
                    width: '32px',
                    height: '32px',
                    padding: 0,
                    marginLeft: '-4px',
                    marginRight: '-8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--txt-muted)',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 400,
                  color: 'var(--txt-faint)',
                  lineHeight: 1.4,
                }}
              >
                matched as {entry.canonical.length > 0 ? entry.canonical.map(humanizeTag).join(', ') : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <Popover.Root open={isOpen} onOpenChange={onOpenChange}>
        <Popover.Anchor asChild>
          <input
            id={`${field}-input`}
            type="text"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              if (!isOpen) onOpenChange(true);
            }}
            onFocus={() => onOpenChange(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim() !== '') {
                e.preventDefault();
                const match = canonicalVocab.find(
                  (v) => v.toLowerCase() === query.trim().toLowerCase(),
                );
                onAdd(
                  match
                    ? { raw: match, canonical: [match] }
                    : { raw: query.trim(), canonical: [] },
                );
                onQueryChange('');
              } else if (e.key === 'Escape') {
                onOpenChange(false);
              }
            }}
            placeholder={FIELD_PLACEHOLDER[field]}
            autoComplete="off"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '16px',
              fontFamily: 'var(--font-inter), Inter, sans-serif',
              color: 'var(--txt-pure)',
              background: 'var(--btn-secondary-bg)',
              border: '1px solid var(--btn-secondary-border)',
              borderRadius: 'var(--r-sm)',
              outline: 'none',
            }}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            style={{
              width: 'var(--radix-popover-trigger-width)',
              maxHeight: '240px',
              overflowY: 'auto',
              background: 'var(--glass-substrate)',
              border: '1px solid var(--btn-secondary-border)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-float)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              padding: '8px',
              zIndex: 1000,
            }}
          >
            <Command shouldFilter={false}>
              <Command.List>
                {matches.length > 0 && (
                  <Command.Group
                    heading="CANONICAL"
                    style={{
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      fontSize: '12px',
                      color: 'var(--txt-faint)',
                    }}
                  >
                    {matches.map((tag) => (
                      <Command.Item
                        key={tag}
                        value={tag}
                        onSelect={() => {
                          onAdd({ raw: tag, canonical: [tag] });
                          onQueryChange('');
                          onOpenChange(false);
                        }}
                        style={{
                          padding: '8px 10px',
                          fontFamily: 'var(--font-inter), Inter, sans-serif',
                          fontSize: '16px',
                          color: 'var(--txt-pure)',
                          cursor: 'pointer',
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        {humanizeTag(tag)}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {isCustom && (
                  <Command.Group
                    heading="OTHERS"
                    style={{
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      fontSize: '12px',
                      color: 'var(--txt-faint)',
                    }}
                  >
                    <Command.Item
                      value={`__custom_${query}`}
                      onSelect={() => {
                        onAdd({ raw: query.trim(), canonical: [] });
                        onQueryChange('');
                        onOpenChange(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        fontFamily: 'var(--font-inter), Inter, sans-serif',
                        fontSize: '16px',
                        color: 'var(--txt-pure)',
                        cursor: 'pointer',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      Add &ldquo;{query.trim()}&rdquo;
                    </Command.Item>
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

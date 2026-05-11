'use client';

// Phase 1 / Plan 01-03. The teammate self-profile form.
//
// 'use client' component — never imports `@/lib/supabase`. All DB work
// happens server-side via fetch to `/api/teams/[id]/profile` (POST).

import { useMemo, useState, useTransition } from 'react';
import { Command } from 'cmdk';
import * as Popover from '@radix-ui/react-popover';
import type { TeammateProfile } from '@/lib/recgon/types';
import { humanizeTag, VOCAB_GROUPS } from '@/lib/recgon/skillVocabulary';

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
  skills: 'Skills',
  strengths: 'Strengths',
  interests: 'Interests',
};

// Plain why-this-matters copy. Drop the "type and pick" mechanics —
// the input + placeholder show that already.
const FIELD_HELPER: Record<FieldKey, string> = {
  skills: 'Languages, frameworks, areas of expertise.',
  strengths: "What you're known for. Counts the same as skills when I match tasks.",
  interests: "What you'd lean into. Breaks ties when two of you fit equally.",
};

const FIELD_PLACEHOLDER: Record<FieldKey, string> = {
  skills: 'Type to search — e.g. React, Python, Figma',
  strengths: 'Type to add — e.g. shipping fast, debugging',
  interests: 'Type to add — e.g. design systems, AI agents',
};

function zipEntries(raw: string[], canonical: string[]): PillEntry[] {
  // Profile rows store raw + canonical as separate flat arrays. On initial
  // load we can only show a canonical mapping for entries whose raw text
  // happens to be in the canonical array; the form refreshes per-entry
  // mappings after the next save.
  return raw.map((r) => ({ raw: r, canonical: canonical.includes(r) ? [r] : [] }));
}

export default function ProfileForm({ teamId, initialProfile, canonicalVocab }: Props) {
  const [skills, setSkills] = useState<PillEntry[]>(() =>
    zipEntries(initialProfile?.skillsRaw ?? [], initialProfile?.skillsCanonical ?? []),
  );
  const [strengths, setStrengths] = useState<PillEntry[]>(() =>
    zipEntries(initialProfile?.strengthsRaw ?? [], initialProfile?.strengthsCanonical ?? []),
  );
  const [interests, setInterests] = useState<PillEntry[]>(() =>
    zipEntries(initialProfile?.interestsRaw ?? [], initialProfile?.interestsCanonical ?? []),
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
    <form onSubmit={handleSubmit} className="profile-form">
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

      <div className="profile-field">
        <label className="recgon-label profile-label" htmlFor="weeklyCapacityHours">
          Weekly capacity
        </label>
        <p className="profile-helper">How many hours you have for new work in a typical week.</p>
        <div className="profile-capacity">
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
            className="profile-input profile-input--narrow"
          />
          <span className="profile-capacity-suffix">hrs / week</span>
        </div>
      </div>

      <div className="profile-actions">
        {outcome && (
          <div
            role="status"
            className={`profile-outcome profile-outcome--${outcome.kind === 'success' ? 'ok' : 'err'}`}
          >
            {outcome.kind === 'success'
              ? outcome.degraded
                ? "Saved your raw text. I'll match it next time the LLM is reachable."
                : 'Profile saved. Recgon will use this on the next run.'
              : outcome.message}
          </div>
        )}
        <button type="submit" disabled={isPending} className="profile-save">
          {isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      <style>{`
        .profile-form { display: flex; flex-direction: column; gap: 28px; }
        .profile-field { display: flex; flex-direction: column; gap: 8px; }
        .profile-label {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--txt-pure);
          margin: 0;
        }
        .profile-helper {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13px;
          line-height: 1.45;
          color: var(--txt-muted);
          margin: 0;
        }
        .profile-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }
        .profile-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 4px 5px 11px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13.5px;
          color: var(--txt-pure);
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-radius: var(--r-pill, 999px);
          transition: border-color 120ms ease;
        }
        .profile-pill:hover { border-color: rgba(var(--signature-rgb), 0.35); }
        .profile-pill-canonical {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--txt-faint);
          letter-spacing: 0.02em;
        }
        .profile-pill-remove {
          width: 22px; height: 22px;
          padding: 0;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--txt-faint);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background 120ms ease, color 120ms ease;
        }
        .profile-pill-remove:hover {
          background: rgba(var(--signature-rgb), 0.12);
          color: var(--txt-pure);
        }
        .profile-input {
          width: 100%;
          padding: 11px 14px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 14.5px;
          color: var(--txt-pure);
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-radius: var(--r-sm);
          outline: none;
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        .profile-input:focus {
          border-color: rgba(var(--signature-rgb), 0.5);
          box-shadow: 0 0 0 3px rgba(var(--signature-rgb), 0.12);
        }
        .profile-input--narrow { width: 96px; }
        .profile-input::placeholder { color: var(--txt-faint); }
        .profile-capacity {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .profile-capacity-suffix {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 12px;
          color: var(--txt-muted);
          letter-spacing: 0.04em;
        }
        .profile-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-top: 20px;
          margin-top: 8px;
          border-top: 1px solid var(--btn-secondary-border);
        }
        .profile-outcome {
          flex: 1;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13.5px;
          line-height: 1.45;
          padding: 8px 12px;
          border-left: 3px solid transparent;
        }
        .profile-outcome--ok {
          color: var(--txt-muted);
          border-left-color: var(--signature);
        }
        .profile-outcome--err {
          color: var(--danger, #f87171);
          border-left-color: var(--danger, #f87171);
        }
        .profile-save {
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
        .profile-save:hover:not(:disabled) { opacity: 0.92; }
        .profile-save:active:not(:disabled) { transform: translateY(1px); }
        .profile-save:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
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
  // Group matches by VOCAB_GROUPS so the dropdown shows "Roles" / "Languages"
  // / "Frontend" sections instead of a flat list. Empty query → curated
  // cross-section. Typing → filtered per group, empty groups dropped.
  const groupedMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VOCAB_GROUPS.map((g) => {
      const tags = q === ''
        ? g.tags.slice(0, 6)
        : g.tags.filter(
            (v) => v.toLowerCase().includes(q) || humanizeTag(v).toLowerCase().includes(q),
          );
      return { label: g.label, tags };
    }).filter((g) => g.tags.length > 0);
  }, [query]);

  const isCustom =
    query.trim() !== '' &&
    !canonicalVocab.some((v) => v.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="profile-field">
      <label className="recgon-label profile-label" htmlFor={`${field}-input`}>
        {FIELD_LABEL[field]}
      </label>
      <p className="profile-helper">{FIELD_HELPER[field]}</p>

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
            className="profile-input"
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            className="profile-popover"
          >
            <Command shouldFilter={false}>
              <Command.List style={{ maxHeight: 'unset' }}>
                {groupedMatches.map((group) => (
                  <Command.Group
                    key={group.label}
                    heading={group.label.toUpperCase()}
                    className="profile-popover-group"
                  >
                    {group.tags.map((tag) => (
                      <Command.Item
                        key={tag}
                        value={tag}
                        onSelect={() => {
                          onAdd({ raw: tag, canonical: [tag] });
                          onQueryChange('');
                          onOpenChange(false);
                        }}
                        className="profile-popover-item"
                      >
                        {humanizeTag(tag)}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
                {isCustom && (
                  <Command.Group heading="ADD AS CUSTOM" className="profile-popover-group">
                    <Command.Item
                      value={`__custom_${query}`}
                      onSelect={() => {
                        onAdd({ raw: query.trim(), canonical: [] });
                        onQueryChange('');
                        onOpenChange(false);
                      }}
                      className="profile-popover-item profile-popover-item--custom"
                    >
                      Add &ldquo;{query.trim()}&rdquo;
                    </Command.Item>
                  </Command.Group>
                )}
              </Command.List>
            </Command>
            <style>{`
              .profile-popover {
                width: var(--radix-popover-trigger-width);
                max-height: 360px;
                overflow-y: auto;
                padding: 6px;
                background: var(--glass-substrate);
                border: 1px solid var(--btn-secondary-border);
                border-radius: var(--r-md);
                box-shadow: var(--shadow-float);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                z-index: 1000;
              }
              .profile-popover-group [cmdk-group-heading] {
                padding: 8px 10px 4px;
                font-family: var(--font-mono), 'JetBrains Mono', monospace;
                font-size: 10.5px;
                font-weight: 500;
                letter-spacing: 0.08em;
                color: var(--txt-faint);
                text-transform: uppercase;
              }
              .profile-popover-item {
                padding: 7px 10px;
                font-family: var(--font-inter), Inter, sans-serif;
                font-size: 14px;
                color: var(--txt-pure);
                cursor: pointer;
                border-radius: var(--r-sm);
                transition: background 100ms ease;
              }
              .profile-popover-item[data-selected="true"],
              .profile-popover-item:hover {
                background: rgba(var(--signature-rgb), 0.10);
              }
              .profile-popover-item--custom {
                color: var(--signature);
                font-weight: 500;
              }
            `}</style>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {entries.length > 0 && (
        <div className="profile-pills">
          {entries.map((entry) => {
            const canonicalLabel =
              entry.canonical.length === 0
                ? 'custom'
                : entry.canonical.length === 1 && entry.canonical[0] === entry.raw
                  ? null
                  : entry.canonical.map(humanizeTag).join(', ');
            return (
              <div key={entry.raw} className="profile-pill">
                <span>{humanizeTag(entry.raw)}</span>
                {canonicalLabel && (
                  <span className="profile-pill-canonical">· {canonicalLabel}</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${entry.raw}`}
                  onClick={() => onRemove(entry.raw)}
                  className="profile-pill-remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

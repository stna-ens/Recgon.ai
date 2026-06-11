'use client';

// Phase 1 / Plan 01-03, redesigned 2026-05-12.
//
// Controlled form fields — state lifted to ProfilePageClient so the
// live preview on the right column reads the same source of truth.
// No save button here; that lives in the sticky savebar in
// ProfilePageClient.
//
// 'use client' component — never imports `@/lib/supabase`.

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Command } from 'cmdk';
import * as Popover from '@radix-ui/react-popover';
import { humanizeTag, VOCAB_GROUPS } from '@/lib/recgon/skillVocabulary';

type FieldKey = 'skills' | 'strengths' | 'interests';

export type PillEntry = {
  raw: string;
  canonical: string[];
};

interface Props {
  canonicalVocab: string[];
  skills: PillEntry[];
  setSkills: (v: PillEntry[]) => void;
  strengths: PillEntry[];
  setStrengths: (v: PillEntry[]) => void;
  interests: PillEntry[];
  setInterests: (v: PillEntry[]) => void;
  capacity: number | null;
  setCapacity: (v: number | null) => void;
  // Phase 2 / Plan 02-03 / SKILL-01: optional inline consent .glass-card,
  // rendered 24px below the rest of the form. ProfilePageClient owns the
  // consent state + OAuth wiring.
  consentSection?: React.ReactNode;
  // Phase 2 redesign 2026-05-12: GitHub-inferred-skills editorial review desk,
  // rendered ABOVE the Skills field (first form section). ProfilePageClient
  // owns the inferred-skill state + PATCH wiring.
  inferredSection?: React.ReactNode;
}

const FIELD_KEYS: FieldKey[] = ['skills', 'strengths', 'interests'];

const FIELD_ICON: Record<FieldKey, React.ReactNode> = {
  skills: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  strengths: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  interests: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
};

const CAPACITY_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export default function ProfileFormFields({
  canonicalVocab,
  skills,
  setSkills,
  strengths,
  setStrengths,
  interests,
  setInterests,
  capacity,
  setCapacity,
  consentSection,
  inferredSection,
}: Props) {
  const t = useTranslations('teams.profile.form');
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [query, setQuery] = useState('');

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

  return (
    <div className="profile-fields">
      {inferredSection}
      {FIELD_KEYS.map((field) => {
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

      <div className="profile-section">
        <div className="profile-section__head">
          <span className="profile-section__icon">{CAPACITY_ICON}</span>
          <label className="profile-section__label" htmlFor="weeklyCapacityHours">
            {t('capacity.label')}
          </label>
        </div>
        <p className="profile-section__helper">
          {t('capacity.helper')}
        </p>
        <div className="profile-capacity">
          <input
            id="weeklyCapacityHours"
            type="number"
            inputMode="numeric"
            min={0}
            max={168}
            step={1}
            value={capacity ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setCapacity(v === '' ? null : Number(v));
            }}
            className="profile-input profile-input--narrow"
          />
          <span className="profile-capacity-suffix">{t('capacity.suffix')}</span>
        </div>
      </div>

      {consentSection}

      <style>{`
        .profile-fields { display: flex; flex-direction: column; gap: 36px; }
        .profile-section { display: flex; flex-direction: column; gap: 10px; }
        .profile-section__head {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .profile-section__icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
        }
        .profile-section__label {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 17px;
          font-weight: 600;
          line-height: 1.2;
          color: var(--txt-pure);
          margin: 0;
        }
        .profile-section__helper {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13.5px;
          line-height: 1.5;
          color: var(--txt-muted);
          margin: 0;
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
        .profile-input::placeholder { color: var(--txt-faint); }
        .profile-input--narrow { width: 96px; }
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
          border-radius: 999px;
          transition: border-color 120ms ease;
          animation: profile-pill-in 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        @keyframes profile-pill-in {
          from { opacity: 0; transform: translateY(2px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
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
      `}</style>
    </div>
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
  const t = useTranslations('teams.profile.form');
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
    <div className="profile-section">
      <div className="profile-section__head">
        <span className="profile-section__icon">{FIELD_ICON[field]}</span>
        <label className="profile-section__label" htmlFor={`${field}-input`}>
          {t(`fields.${field}.label`)}
        </label>
        {entries.length > 0 && (
          <span className="profile-section__count">{entries.length}</span>
        )}
      </div>
      <p className="profile-section__helper">{t(`fields.${field}.helper`)}</p>

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
            placeholder={t(`fields.${field}.placeholder`)}
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
                  <Command.Group heading={t('addCustomHeading')} className="profile-popover-group">
                    <Command.Item
                      value={`__custom_${query}`}
                      onSelect={() => {
                        onAdd({ raw: query.trim(), canonical: [] });
                        onQueryChange('');
                        onOpenChange(false);
                      }}
                      className="profile-popover-item profile-popover-item--custom"
                    >
                      {t('addCustom', { query: query.trim() })}
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
                ? t('customTag')
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
                  aria-label={t('removeAria', { tag: entry.raw })}
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

      <style>{`
        .profile-section__count {
          padding: 1px 7px;
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
          border-radius: 999px;
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}

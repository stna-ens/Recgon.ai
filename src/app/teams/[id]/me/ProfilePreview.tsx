'use client';

// Phase 1 (UAT redesign). Live read-only "how Recgon sees you" card.
// Sits in the right column. The container makes it sticky so the
// preview follows the user as they scroll the form.

import { humanizeTag } from '@/lib/recgon/skillVocabulary';

type PillEntry = { raw: string; canonical: string[] };

interface Props {
  user: {
    nickname: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  teamName: string;
  skills: PillEntry[];
  strengths: PillEntry[];
  interests: PillEntry[];
  capacity: number | null;
  // Phase 2 / Plan 02-03 / SKILL-03 / D-26: right-rail "INFERRED FROM GITHUB"
  // section. Rendered 24px below "Likely matched to". Wrapped with id so the
  // ReviewBanner's smooth-scroll target works.
  inferredSection?: React.ReactNode;
}

function pillLabel(entry: PillEntry): string {
  if (entry.canonical.length > 0 && entry.canonical[0] !== entry.raw) {
    return humanizeTag(entry.canonical[0]);
  }
  return humanizeTag(entry.raw);
}

function suggestTaskKinds(skills: PillEntry[]): string[] {
  const tags = new Set(skills.flatMap((s) => [s.raw, ...s.canonical]));
  const hints: string[] = [];
  if (tags.has('frontend') || tags.has('react') || tags.has('vue') || tags.has('svelte')) hints.push('Frontend work');
  if (tags.has('backend') || tags.has('nodejs') || tags.has('django') || tags.has('rails')) hints.push('Backend work');
  if (tags.has('design') || tags.has('ux_design') || tags.has('figma')) hints.push('Design tasks');
  if (tags.has('marketing') || tags.has('social_media') || tags.has('content_writing')) hints.push('Marketing & content');
  if (tags.has('analytics') || tags.has('data') || tags.has('ga4')) hints.push('Analytics & data');
  if (tags.has('product') || tags.has('strategy') || tags.has('research')) hints.push('Product & strategy');
  if (tags.has('qa') || tags.has('testing')) hints.push('QA & verification');
  if (tags.has('mobile') || tags.has('ios') || tags.has('android')) hints.push('Mobile work');
  if (tags.has('ai') || tags.has('ml') || tags.has('llm')) hints.push('AI & ML tasks');
  return hints.slice(0, 4);
}

const CAPACITY_FULL = 40;

export default function ProfilePreview({
  user,
  teamName,
  skills,
  strengths,
  interests,
  capacity,
  inferredSection,
}: Props) {
  const initials = (user.nickname || user.email || '?').slice(0, 2).toUpperCase();
  const totalDeclarations = skills.length + strengths.length + interests.length;
  const taskHints = suggestTaskKinds(skills);
  const capacityPct =
    capacity === null ? 0 : Math.min(100, Math.max(0, (capacity / CAPACITY_FULL) * 100));

  return (
    <div className="profile-preview">
      <div className="profile-preview__head">
        <div className="profile-preview__eyebrow">HOW I SEE YOU</div>
        <h2 className="profile-preview__h2">Live preview</h2>
      </div>

      <div className="profile-preview__card">
        <div className="profile-preview__identity">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="profile-preview__avatar" />
          ) : (
            <div className="profile-preview__avatar profile-preview__avatar--initials">
              {initials}
            </div>
          )}
          <div className="profile-preview__identity-text">
            <div className="profile-preview__name">{user.nickname || 'You'}</div>
            <div className="profile-preview__team">on {teamName}</div>
          </div>
        </div>

        {totalDeclarations === 0 && capacity === null ? (
          <div className="profile-preview__empty">
            Start declaring skills on the left and you&apos;ll see what tasks I&apos;d send your way.
          </div>
        ) : (
          <>
            {skills.length > 0 && (
              <PreviewSection label="Skills" count={skills.length}>
                <PillList items={skills} variant="primary" />
              </PreviewSection>
            )}
            {strengths.length > 0 && (
              <PreviewSection label="Strengths" count={strengths.length}>
                <PillList items={strengths} variant="secondary" />
              </PreviewSection>
            )}
            {interests.length > 0 && (
              <PreviewSection label="Interests" count={interests.length}>
                <PillList items={interests} variant="secondary" />
              </PreviewSection>
            )}

            <PreviewSection label="Weekly capacity">
              {capacity === null ? (
                <div className="profile-preview__capacity-empty">Not set</div>
              ) : (
                <div className="profile-preview__capacity">
                  <div className="profile-preview__capacity-bar">
                    <div
                      className="profile-preview__capacity-fill"
                      style={{ width: `${capacityPct}%` }}
                    />
                  </div>
                  <div className="profile-preview__capacity-label">
                    {capacity} {capacity === 1 ? 'hr' : 'hrs'} / week
                  </div>
                </div>
              )}
            </PreviewSection>

            {taskHints.length > 0 && (
              <PreviewSection label="Likely matched to">
                <ul className="profile-preview__hints">
                  {taskHints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </PreviewSection>
            )}
          </>
        )}

        {inferredSection && (
          <div
            id="inferred-from-github-section"
            className="profile-preview__inferred"
          >
            {inferredSection}
          </div>
        )}
      </div>

      <style>{`
        .profile-preview {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .profile-preview__head { display: flex; flex-direction: column; gap: 4px; }
        .profile-preview__eyebrow {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.12em;
          color: var(--txt-faint);
        }
        .profile-preview__h2 {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: var(--txt-muted);
          margin: 0;
        }
        .profile-preview__card {
          padding: 22px;
          background: var(--glass-substrate);
          border: 1px solid var(--btn-secondary-border);
          border-radius: var(--r-md);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .profile-preview__identity {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--btn-secondary-border);
        }
        .profile-preview__avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          object-fit: cover;
          background: rgba(var(--signature-rgb), 0.10);
          border: 1px solid var(--btn-secondary-border);
        }
        .profile-preview__avatar--initials {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 700;
          color: var(--signature);
          letter-spacing: 0.04em;
        }
        .profile-preview__identity-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .profile-preview__name {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: var(--txt-pure);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .profile-preview__team {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--txt-faint);
          letter-spacing: 0.02em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .profile-preview__empty {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          color: var(--txt-faint);
          padding: 8px 4px;
        }
        .profile-preview__capacity {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .profile-preview__capacity-bar {
          height: 6px;
          background: var(--btn-secondary-bg);
          border-radius: 999px;
          overflow: hidden;
        }
        .profile-preview__capacity-fill {
          height: 100%;
          background: linear-gradient(
            90deg,
            rgba(var(--signature-rgb), 0.7) 0%,
            var(--signature) 100%
          );
          border-radius: inherit;
          transition: width 240ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .profile-preview__capacity-label {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--txt-muted);
          letter-spacing: 0.04em;
        }
        .profile-preview__capacity-empty {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13px;
          color: var(--txt-faint);
        }
        .profile-preview__hints {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .profile-preview__hints li {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 13px;
          color: var(--txt-muted);
          padding-left: 14px;
          position: relative;
        }
        .profile-preview__hints li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 8px;
          width: 6px;
          height: 1px;
          background: var(--signature);
        }
        .profile-preview__inferred {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--btn-secondary-border);
        }
      `}</style>
    </div>
  );
}

interface PreviewSectionProps {
  label: string;
  count?: number;
  children: React.ReactNode;
}

function PreviewSection({ label, count, children }: PreviewSectionProps) {
  return (
    <div className="profile-preview-section">
      <div className="profile-preview-section__head">
        <span className="profile-preview-section__label">{label}</span>
        {typeof count === 'number' && (
          <span className="profile-preview-section__count">{count}</span>
        )}
      </div>
      {children}
      <style>{`
        .profile-preview-section { display: flex; flex-direction: column; gap: 8px; }
        .profile-preview-section__head {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.08em;
          color: var(--txt-faint);
          text-transform: uppercase;
        }
        .profile-preview-section__count {
          padding: 1px 7px;
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
          border-radius: 999px;
          font-size: 10px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

interface PillListProps {
  items: PillEntry[];
  variant: 'primary' | 'secondary';
}

function PillList({ items, variant }: PillListProps) {
  return (
    <div className={`preview-pillrow preview-pillrow--${variant}`}>
      {items.map((item) => (
        <span key={item.raw} className="preview-pill">
          {pillLabel(item)}
        </span>
      ))}
      <style>{`
        .preview-pillrow { display: flex; flex-wrap: wrap; gap: 5px; }
        .preview-pill {
          padding: 3px 9px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 12.5px;
          color: var(--txt-pure);
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-radius: 999px;
          white-space: nowrap;
        }
        .preview-pillrow--primary .preview-pill {
          background: rgba(var(--signature-rgb), 0.08);
          border-color: rgba(var(--signature-rgb), 0.18);
        }
      `}</style>
    </div>
  );
}

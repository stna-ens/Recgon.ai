'use client';

// Phase 2 / Plan 02-03 / SKILL-03 + SKILL-05.
//
// Right-rail "INFERRED FROM GITHUB" section. Renders accepted (signature-pink)
// and rejected (muted, line-through) pills with provenance chips, plus a
// Re-scan button with relative-time timestamp.
//
// Pure presentational + callback-driven — does NOT call fetch. Page client
// owns the optimistic flip + 6-second undo + PATCH wiring (Task 3). This keeps
// the component unit-testable against the pre-existing
// `src/__tests__/inferredSkills.ui.test.tsx` fixture.
//
// All colors come from `var(--signature)`, `var(--signature-rgb)`,
// `var(--btn-secondary-*)`, `var(--txt-*)`, `var(--r-sm)`, `var(--dur-fast)`,
// `var(--ease-out)` — UI-SPEC Color reserved-for items 6–9.

import { useMemo, useState, useEffect } from 'react';
import { RefreshCw, X, ExternalLink, AlertCircle } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { InferredSkill, InferredSkillSource } from '@/lib/recgon/types';

// Phase 2 — UI mirror of `ScanDiagnostics` from `src/lib/recgon/githubSkills.ts`,
// plus a UI-only `skippedReason` field so we can distinguish the
// `{skipped:true, reason:'no_team_repos'}` shape from the `{skipped:false,...}`
// shape without leaking the full result discriminator into the component.
export type ScanDiagnostics = {
  reposScanned: number;
  commitsFound: number;
  signalsEmitted: number;
  llmDroppedTags: number;
  githubEmailPrivate: boolean | null;
  githubLogin: string | null;
  skippedReason:
    | 'no_consent'
    | 'no_token'
    | 'no_team_repos'
    | 'no_author'
    | null;
};

interface Props {
  items: InferredSkill[];
  lastScanAt?: string | null;
  consented?: boolean;
  isScanning?: boolean;
  onReject: (id: string) => void;
  onUndoReject: (id: string) => void;
  onRescan?: () => void;
  rescanRateLimitedUntil?: number | null;
  /** Most recent scan's diagnostics — drives the empty-state explanation. */
  diagnostics?: ScanDiagnostics | null;
  /** GitHub username for personalised diagnostic copy. */
  githubUsername?: string | null;
}

// SOURCE -> chip text. Locked by UI-SPEC §Right-rail "INFERRED FROM GITHUB"
// section + §Provenance chip — visual contract table.
const SOURCE_CHIP: Record<InferredSkillSource, string> = {
  llm_commit: 'COMMIT-MINED',
  linguist: 'LANGUAGE STATS',
  extension: 'EXTENSION',
  llm_import: 'IMPORTS',
};

const SOURCE_TOOLTIP: Record<InferredSkillSource, string> = {
  llm_commit: 'From commit titles you authored in the last 6 months.',
  linguist: "From the languages GitHub sees in this team's repos.",
  extension: 'From file extensions in commits you authored.',
  llm_import: "From import statements in files you've changed.",
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Awaiting first scan';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Last scanned just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const min = Math.round(ms / 60_000);
  if (min < 60) return `Last scanned ${rtf.format(-min, 'minute')}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Last scanned ${rtf.format(-hr, 'hour')}`;
  const d = Math.round(hr / 24);
  if (d < 30) return `Last scanned ${rtf.format(-d, 'day')}`;
  const mo = Math.round(d / 30);
  return `Last scanned ${rtf.format(-mo, 'month')}`;
}

function InferredPill({
  item,
  optimisticallyRejected,
  onReject,
}: {
  item: InferredSkill;
  optimisticallyRejected: boolean;
  onReject: (id: string) => void;
}) {
  // Pill is rejected if EITHER the server row says so OR we optimistically
  // flipped it locally (SKILL-05 — instant UI feedback, see UI-SPEC reject
  // interaction step 2). The parent's `onReject` PATCH commits the server
  // truth; this component re-syncs to `item.rejectedAt` whenever the parent
  // pushes new props down.
  const rejected = item.rejectedAt !== null || optimisticallyRejected;
  return (
    <div
      data-skill-id={item.id}
      data-rejected={rejected ? 'true' : 'false'}
      className={`inferred-pill${rejected ? ' inferred-pill--rejected preview-pill--rejected' : ''}`}
    >
      <div className="inferred-pill__lines">
        <span className="inferred-pill__tag">{item.canonicalTag}</span>
        {rejected ? (
          <span className="inferred-pill__caption">rejected</span>
        ) : (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="inferred-pill__chip">{SOURCE_CHIP[item.source]}</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="inferred-tooltip" sideOffset={6}>
                {SOURCE_TOOLTIP[item.source]}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        )}
      </div>
      {!rejected && (
        <button
          type="button"
          aria-label={`Reject inferred skill ${item.canonicalTag}`}
          className="inferred-pill__x"
          onClick={() => onReject(item.id)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Diagnostic-aware empty state. Picks one of five real-world causes
// for "no pills" and explains it in plain English with an action button
// when there's something the user can do. Locked to the right-rail's narrow
// width — copy stays short, primary action is one line, tone is first-person
// (matches the rest of the consent + scan messaging).
function EmptyState({
  diagnostics,
  githubUsername,
  isRateLimited,
  onRescan,
}: {
  diagnostics: ScanDiagnostics | null | undefined;
  githubUsername: string | null | undefined;
  isRateLimited: boolean;
  onRescan?: () => void;
}) {
  // No diagnostics yet → first-load fallback. Matches the previous behaviour.
  if (!diagnostics) {
    return (
      <p className="inferred-section__empty">
        I haven&apos;t scanned your commits yet. Click <span className="inferred-section__inline-key">Re-scan</span> to start.
      </p>
    );
  }

  // No GitHub repos connected to this team yet.
  if (diagnostics.skippedReason === 'no_team_repos') {
    return (
      <EmptyCard
        tone="info"
        title="No GitHub repos to scan"
        body="Add a project with a GitHub URL to this team and I'll start mining commits the next time we scan."
      />
    );
  }

  // OAuth token missing (consent there, but no token on the user row).
  if (diagnostics.skippedReason === 'no_token') {
    return (
      <EmptyCard
        tone="warn"
        title="GitHub connection lost"
        body="I'm consented to mine, but I don't have a valid GitHub token for your account. Disconnect and reconnect to fix this."
      />
    );
  }

  // The big one: 0 commits found AND email is private. We're confident this is
  // the cause — surface the fix prominently with a direct deep-link.
  if (diagnostics.commitsFound === 0 && diagnostics.githubEmailPrivate === true) {
    return (
      <EmptyCard
        tone="warn"
        title="Your GitHub email is private"
        body={
          <>
            GitHub hides your commits from us when{' '}
            <span className="inferred-section__inline-key">
              Keep my email addresses private
            </span>{' '}
            is on. Turn it off and I&apos;ll find your skills.
          </>
        }
        primary={{
          label: 'Open email settings',
          href: 'https://github.com/settings/emails',
        }}
        secondary={
          onRescan
            ? {
                label: 'Try again',
                onClick: onRescan,
                disabled: isRateLimited,
              }
            : undefined
        }
      />
    );
  }

  // 0 commits found and email is confirmed PUBLIC → most likely a different
  // attribution issue (commit email not on the GitHub account, or no commits).
  if (diagnostics.commitsFound === 0 && diagnostics.githubEmailPrivate === false) {
    const who = githubUsername ?? diagnostics.githubLogin ?? 'this GitHub account';
    return (
      <EmptyCard
        tone="info"
        title="No commits by you in the last 6 months"
        body={
          <>
            I checked{' '}
            <span className="inferred-section__inline-key">
              {diagnostics.reposScanned}
            </span>{' '}
            {diagnostics.reposScanned === 1 ? 'repo' : 'repos'} but saw no commits
            attributed to <span className="inferred-section__inline-key">{who}</span>.
            If you&apos;ve committed under a different account, switch and reconnect.
          </>
        }
        secondary={
          onRescan
            ? {
                label: 'Try again',
                onClick: onRescan,
                disabled: isRateLimited,
              }
            : undefined
        }
      />
    );
  }

  // 0 commits found, email status unknown (probe didn't run or failed).
  // Generic but honest fallback.
  if (diagnostics.commitsFound === 0) {
    return (
      <EmptyCard
        tone="info"
        title="No commits to read"
        body={
          <>
            I didn&apos;t find any commits by you in the last 6 months across{' '}
            this team&apos;s repos. Push something and I&apos;ll re-check.
          </>
        }
        secondary={
          onRescan
            ? {
                label: 'Try again',
                onClick: onRescan,
                disabled: isRateLimited,
              }
            : undefined
        }
      />
    );
  }

  // Commits found but the signal extractors couldn't pull skills out.
  return (
    <EmptyCard
      tone="info"
      title="Couldn't infer skills"
      body={
        <>
          I read{' '}
          <span className="inferred-section__inline-key">
            {diagnostics.commitsFound}
          </span>{' '}
          {diagnostics.commitsFound === 1 ? 'commit' : 'commits'} but couldn&apos;t
          tie them to a clear skill. Descriptive commit messages help —{' '}
          &ldquo;feat: add Stripe checkout&rdquo; tells me more than &ldquo;fixes&rdquo;.
        </>
      }
      secondary={
        onRescan
          ? {
              label: 'Try again',
              onClick: onRescan,
              disabled: isRateLimited,
            }
          : undefined
      }
    />
  );
}

// Generic empty/diagnostic card. Used by `EmptyState` for every branch except
// the very first "haven't scanned yet" preface. Two tones map to the visual
// affordance of "actionable" vs "informational":
//   - `warn`  = signature-pink chrome (something for the user to do)
//   - `info`  = muted chrome             (nothing urgent, just context)
function EmptyCard({
  tone,
  title,
  body,
  primary,
  secondary,
}: {
  tone: 'warn' | 'info';
  title: string;
  body: React.ReactNode;
  primary?: { label: string; href: string };
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className={`empty-card empty-card--${tone}`}>
      <div className="empty-card__title-row">
        <AlertCircle size={14} aria-hidden="true" className="empty-card__icon" />
        <span className="empty-card__title">{title}</span>
      </div>
      <p className="empty-card__body">{body}</p>
      {(primary || secondary) && (
        <div className="empty-card__actions">
          {primary && (
            <a
              className="empty-card__primary"
              href={primary.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{primary.label}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          {secondary && (
            <button
              type="button"
              className="empty-card__secondary"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function InferredFromGitHub({
  items,
  lastScanAt = null,
  consented = true,
  isScanning = false,
  onReject,
  onRescan,
  rescanRateLimitedUntil = null,
  diagnostics = null,
  githubUsername = null,
}: Props) {
  // SKILL-05 optimistic-reject set. Cleared when the parent pushes new props
  // (server truth lands → `item.rejectedAt` set → no need to keep the optimistic
  // override). Parent owns the 6-second undo timer.
  const [optimisticRejects, setOptimisticRejects] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    // Drop any IDs from the optimistic set once the parent's items confirm them.
    setOptimisticRejects((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const row = items.find((i) => i.id === id);
        if (row && row.rejectedAt === null) next.add(id);
      }
      return next;
    });
  }, [items]);

  function handleRejectClick(id: string) {
    setOptimisticRejects((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onReject(id);
  }

  const accepted = useMemo(
    () => items.filter((i) => i.rejectedAt === null && !optimisticRejects.has(i.id)),
    [items, optimisticRejects],
  );
  const rejected = useMemo(
    () => items.filter((i) => i.rejectedAt !== null || optimisticRejects.has(i.id)),
    [items, optimisticRejects],
  );

  const isRateLimited =
    rescanRateLimitedUntil !== null && rescanRateLimitedUntil > Date.now();
  const minutesUntilOk = isRateLimited
    ? Math.max(1, Math.ceil(((rescanRateLimitedUntil ?? 0) - Date.now()) / 60_000))
    : 0;

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className={`inferred-section${isScanning ? ' inferred-section--scanning' : ''}`}>
        <div className="inferred-section__head">
          <span className="inferred-section__label">INFERRED FROM GITHUB</span>
          <div className="inferred-section__meta">
            {consented && (
              <span className="inferred-section__timestamp">
                {formatRelative(lastScanAt)}
              </span>
            )}
            {consented && onRescan && (
              <Tooltip.Root open={isRateLimited ? undefined : false}>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className={`inferred-rescan${isScanning ? ' inferred-rescan--spin' : ''}`}
                    onClick={onRescan}
                    disabled={isScanning || isRateLimited}
                    aria-label="Re-scan GitHub for inferred skills"
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>Re-scan</span>
                  </button>
                </Tooltip.Trigger>
                {isRateLimited && (
                  <Tooltip.Portal>
                    <Tooltip.Content className="inferred-tooltip" sideOffset={6}>
                      Already scanned recently. Next scan available in {minutesUntilOk}m.
                    </Tooltip.Content>
                  </Tooltip.Portal>
                )}
              </Tooltip.Root>
            )}
          </div>
        </div>

        {!consented ? (
          <p className="inferred-section__empty">
            Once you connect GitHub, I&apos;ll add suggested skills here based on the commits
            you&apos;ve actually shipped.
          </p>
        ) : isScanning ? (
          <p className="inferred-section__empty">Looking at your commits…</p>
        ) : items.length === 0 ? (
          <EmptyState
            diagnostics={diagnostics}
            githubUsername={githubUsername}
            isRateLimited={isRateLimited}
            onRescan={onRescan}
          />
        ) : (
          <div className="inferred-pills">
            {accepted.map((item) => (
              <InferredPill
                key={item.id}
                item={item}
                optimisticallyRejected={false}
                onReject={handleRejectClick}
              />
            ))}
            {rejected.map((item) => (
              <InferredPill
                key={item.id}
                item={item}
                optimisticallyRejected={optimisticRejects.has(item.id)}
                onReject={handleRejectClick}
              />
            ))}
          </div>
        )}

        <style>{`
          .inferred-section {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 4px;
            border: 1px solid transparent;
            border-radius: var(--r-sm);
            transition: border-color var(--dur-fast) var(--ease-out);
          }
          .inferred-section--scanning {
            animation: inferred-pulse 2s ease-in-out infinite;
          }
          @keyframes inferred-pulse {
            0%, 100% { border-color: rgba(var(--signature-rgb), 0.04); }
            50%      { border-color: rgba(var(--signature-rgb), 0.25); }
          }
          .inferred-section__head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
          }
          .inferred-section__label {
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.04em;
            color: var(--txt-pure);
            text-transform: uppercase;
          }
          .inferred-section__meta {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .inferred-section__timestamp {
            font-size: 12px;
            font-weight: 400;
            color: var(--txt-muted);
          }
          .inferred-rescan {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--txt-muted);
            background: transparent;
            border: 1px solid var(--btn-secondary-border);
            border-radius: var(--r-sm);
            cursor: pointer;
            transition: color var(--dur-fast) var(--ease-out),
                        border-color var(--dur-fast) var(--ease-out);
            min-height: 32px;
          }
          .inferred-rescan:hover:not(:disabled) {
            color: var(--txt-pure);
            border-color: rgba(var(--signature-rgb), 0.34);
          }
          .inferred-rescan:disabled { opacity: 0.55; cursor: not-allowed; }
          .inferred-rescan--spin { color: var(--signature); }
          .inferred-rescan--spin svg {
            animation: inferred-spin 0.8s linear infinite;
          }
          @keyframes inferred-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }

          .inferred-section__empty {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            color: var(--txt-muted);
            margin: 0;
            padding: 6px 4px;
          }
          .inferred-section__inline-key {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 500;
            color: var(--txt-pure);
            padding: 1px 5px;
            border-radius: 4px;
            background: var(--btn-secondary-bg);
            border: 1px solid var(--btn-secondary-border);
          }

          /* Diagnostic empty-state card. Two tones: warn (signature-pink
             accent — user has something to do) and info (muted — context
             only). Visual order: title row, body, primary CTA + try-again. */
          .empty-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 14px;
            border-radius: var(--r-sm);
            border: 1px solid var(--btn-secondary-border);
            background: var(--btn-secondary-bg);
            font-family: var(--font-inter), Inter, sans-serif;
          }
          .empty-card--warn {
            border-color: rgba(var(--signature-rgb), 0.34);
            background: rgba(var(--signature-rgb), 0.04);
          }
          .empty-card__title-row {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .empty-card__icon {
            flex-shrink: 0;
            color: var(--txt-muted);
          }
          .empty-card--warn .empty-card__icon {
            color: var(--signature);
          }
          .empty-card__title {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.3;
            color: var(--txt-pure);
          }
          .empty-card__body {
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
            color: var(--txt-muted);
          }
          .empty-card__actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            margin-top: 2px;
          }
          .empty-card__primary {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 13px;
            font-weight: 600;
            color: white;
            background: var(--signature);
            border: none;
            border-radius: var(--r-sm);
            text-decoration: none;
            cursor: pointer;
            transition: opacity 120ms ease, transform 120ms ease;
          }
          .empty-card__primary:hover {
            opacity: 0.92;
          }
          .empty-card__primary:active {
            transform: translateY(1px);
          }
          .empty-card__secondary {
            padding: 0;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--txt-muted);
            background: transparent;
            border: none;
            cursor: pointer;
            transition: color var(--dur-fast) var(--ease-out);
          }
          .empty-card__secondary:hover:not(:disabled) {
            color: var(--txt-pure);
          }
          .empty-card__secondary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .inferred-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .inferred-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px 4px 12px;
            background: rgba(var(--signature-rgb), 0.08);
            border: 1px solid rgba(var(--signature-rgb), 0.34);
            border-radius: var(--r-sm);
            transition: background var(--dur-fast) var(--ease-out),
                        border-color var(--dur-fast) var(--ease-out),
                        opacity var(--dur-fast) var(--ease-out);
          }
          .inferred-pill--rejected {
            background: var(--btn-secondary-bg);
            border-color: var(--btn-secondary-border);
          }
          .inferred-pill__lines {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
          }
          .inferred-pill__tag {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 16px;
            font-weight: 400;
            line-height: 1.2;
            color: var(--signature);
          }
          .inferred-pill--rejected .inferred-pill__tag {
            color: var(--txt-faint);
            text-decoration: line-through;
          }
          .inferred-pill__chip {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 500;
            line-height: 1.2;
            letter-spacing: 0.04em;
            color: var(--txt-muted);
            text-transform: uppercase;
            cursor: help;
          }
          .inferred-pill__caption {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 400;
            line-height: 1.2;
            color: var(--txt-faint);
          }
          .inferred-pill__x {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            border-radius: 50%;
            color: var(--txt-muted);
            cursor: pointer;
            transition: color var(--dur-fast) var(--ease-out),
                        background var(--dur-fast) var(--ease-out);
          }
          .inferred-pill__x:hover {
            color: var(--danger);
            background: rgba(var(--signature-rgb), 0.06);
          }

          .inferred-tooltip {
            padding: 8px 10px;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 400;
            line-height: 1.4;
            color: var(--txt-pure);
            background: var(--glass-substrate);
            border: 1px solid var(--btn-secondary-border);
            border-radius: var(--r-sm);
            box-shadow: var(--shadow-float);
            max-width: 260px;
            z-index: 1000;
          }
        `}</style>
      </div>
    </Tooltip.Provider>
  );
}

export default InferredFromGitHub;

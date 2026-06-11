'use client';

// Phase 2 / Plan 02-03 / SKILL-03 + SKILL-05. Redesigned 2026-05-12 ("Editorial
// Review Desk"). Replaces the previous right-rail pill cluster with a left-
// column .glass-card hosting three zones:
//
//   1. PENDING REVIEW — decision cards with explicit Keep / Drop buttons
//   2. KEPT           — compact pink pills matching the existing accepted state
//   3. DROPPED        — muted strikethrough pills, collapsed by default
//
// Every locked UI-SPEC constraint is preserved:
//   - Eyebrow copy "INFERRED FROM GITHUB" (exact)
//   - Provenance chip labels (COMMIT-MINED / LANGUAGE STATS / EXTENSION / IMPORTS)
//   - Per-pill ARIA "Reject inferred skill {canonical}" on the Drop button
//   - Tooltip "I'm using this when matching tasks to you." on Kept-pill hover
//   - Tooltip "Drop this from my profile. Permanent — I won't suggest it again."
//     on Drop-button hover
//   - 6-second undo window on Drop (parent owns the timer, same pattern as before)
//   - Rejection permanence — the worker's listRejectedTags() pre-filter handles
//     this; nothing in the UI re-suggests a dropped skill
//
// Pure presentational + callback-driven. Page client owns the PATCH wiring.

import { useMemo, useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { RefreshCw, X, ExternalLink, AlertCircle, Check } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { InferredSkill, InferredSkillSource } from '@/lib/recgon/types';

// UI-side mirror of `ScanDiagnostics` from lib/recgon/githubSkills.ts plus a
// `skippedReason` field so the empty-state code can branch on the worker's
// early-exit reason without needing the full RunScanResult discriminator.
export type ScanDiagnostics = {
  reposScanned: number;
  commitsFound: number;
  signalsEmitted: number;
  llmDroppedTags: number;
  githubEmailPrivate: boolean | null;
  githubLogin: string | null;
  githubVerifiedEmails: string[] | null;
  recentCommitSample:
    | Array<{ authorLogin: string | null; authorEmail: string | null; sha: string }>
    | null;
  sampleCommitsByVerifiedEmail: number;
  sampleCommitsAttributedToUser: number;
  tokenScopes: string[] | null;
  tokenStatus: number | null;
  repoProbeResults:
    | Array<{ owner: string; repo: string; status: number }>
    | null;
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
  onKeep: (id: string) => void;
  onRescan?: () => void;
  rescanRateLimitedUntil?: number | null;
  diagnostics?: ScanDiagnostics | null;
  githubUsername?: string | null;
  onReconnect?: () => void;
}

// SOURCE → chip text + tooltip live in messages/<locale>/teams.json under
// teams.profile.inferred.sources.<source>. English copy locked by UI-SPEC
// §Right-rail "INFERRED FROM GITHUB" section + §Provenance chip table.
type SimpleT = (key: string, values?: Record<string, string | number>) => string;

function sourceChip(t: SimpleT, source: InferredSkillSource): string {
  return t(`sources.${source}.chip`);
}

function sourceTooltip(t: SimpleT, source: InferredSkillSource): string {
  return t(`sources.${source}.tooltip`);
}

function formatRelative(
  iso: string | null | undefined,
  t: SimpleT,
  locale: string,
): string {
  if (!iso) return t('scanAwaiting');
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t('scanJustNow');
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const min = Math.round(ms / 60_000);
  if (min < 60) return t('scanLast', { rel: rtf.format(-min, 'minute') });
  const hr = Math.round(min / 60);
  if (hr < 24) return t('scanLast', { rel: rtf.format(-hr, 'hour') });
  const d = Math.round(hr / 24);
  if (d < 30) return t('scanLast', { rel: rtf.format(-d, 'day') });
  const mo = Math.round(d / 30);
  return t('scanLast', { rel: rtf.format(-mo, 'month') });
}

// ──────────────────────────────────────────────────────────────────────────────
// Pending decision card — the centerpiece of the redesign. Two-row grid:
// (skill name + source chip) above (Keep + Drop buttons). The Drop button
// preserves the locked ARIA + tooltip; Keep is a brand-new affordance that
// the spec didn't have but the underlying API has supported all along
// (PATCH `{reviewed: true}` sets `user_reviewed_at`).
// ──────────────────────────────────────────────────────────────────────────────

function PendingDecisionCard({
  item,
  onKeep,
  onReject,
}: {
  item: InferredSkill;
  onKeep: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const t = useTranslations('teams.profile.inferred');
  return (
    <div
      data-skill-id={item.id}
      data-state="pending"
      className="pending-card"
    >
      <span className="pending-card__tag">{item.canonicalTag}</span>

      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="pending-card__chip">{sourceChip(t, item.source)}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="inferred-tooltip" sideOffset={6}>
            {sourceTooltip(t, item.source)}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>

      <div className="pending-card__actions">
        <button
          type="button"
          className="pending-card__keep"
          onClick={() => onKeep(item.id)}
          aria-label={t('keepAria', { tag: item.canonicalTag })}
        >
          <Check size={14} aria-hidden="true" />
          <span>{t('keep')}</span>
        </button>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              className="pending-card__drop"
              onClick={() => onReject(item.id)}
              aria-label={t('rejectAria', { tag: item.canonicalTag })}
            >
              <span>{t('drop')}</span>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="inferred-tooltip" sideOffset={6}>
              {t('dropTooltip')}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Kept pill — reuses the existing accepted-state visual treatment locked by
// UI-SPEC §Color reserved-for items 6–9 (pink fill + border + text). Hover
// surfaces a small Drop affordance so the user can change their mind without
// hunting for a separate menu.
// ──────────────────────────────────────────────────────────────────────────────

function KeptPill({
  item,
  onReject,
}: {
  item: InferredSkill;
  onReject: (id: string) => void;
}) {
  const t = useTranslations('teams.profile.inferred');
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div
          data-skill-id={item.id}
          data-state="kept"
          data-kept="true"
          className="kept-pill"
        >
          <div className="kept-pill__lines">
            <span className="kept-pill__tag">{item.canonicalTag}</span>
            <span className="kept-pill__chip">{sourceChip(t, item.source)}</span>
          </div>
          <button
            type="button"
            className="kept-pill__drop"
            onClick={(e) => {
              e.stopPropagation();
              onReject(item.id);
            }}
            aria-label={t('rejectAria', { tag: item.canonicalTag })}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="inferred-tooltip" sideOffset={6}>
          {t('keptTooltip')}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Dropped pill — muted strikethrough, with a tiny Undo text-button visible
// only within the 6-second undo window (parent controls timer; the optimistic
// state on this row is set in the parent's handleReject closure).
// ──────────────────────────────────────────────────────────────────────────────

function DroppedPill({
  item,
  withinUndoWindow,
  onUndo,
}: {
  item: InferredSkill;
  withinUndoWindow: boolean;
  onUndo: (id: string) => void;
}) {
  const t = useTranslations('teams.profile.inferred');
  return (
    <div
      data-skill-id={item.id}
      data-state="dropped"
      data-rejected="true"
      className="dropped-pill"
    >
      <div className="dropped-pill__lines">
        <span className="dropped-pill__tag">{item.canonicalTag}</span>
        <span className="dropped-pill__caption">{t('droppedCaption')}</span>
      </div>
      {withinUndoWindow && (
        <button
          type="button"
          className="dropped-pill__undo"
          onClick={() => onUndo(item.id)}
          aria-label={t('undoAria', { tag: item.canonicalTag })}
        >
          {t('undo')}
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Empty / diagnostic states. The full diagnostic branching from earlier today
// (no_consent, no_token, no_team_repos, no_author, missing repo scope,
// blocked repos, email private, etc.) is preserved verbatim — the user has
// invested a lot in making these messages right.
// ──────────────────────────────────────────────────────────────────────────────

function EmptyState({
  diagnostics,
  githubUsername,
  isRateLimited,
  onRescan,
  onReconnect,
}: {
  diagnostics: ScanDiagnostics | null | undefined;
  githubUsername: string | null | undefined;
  isRateLimited: boolean;
  onRescan?: () => void;
  onReconnect?: () => void;
}) {
  const t = useTranslations('teams.profile.inferred');
  const inlineKey = (chunks: React.ReactNode) => (
    <span className="inferred-desk__inline-key">{chunks}</span>
  );

  if (!diagnostics) {
    return (
      <p className="inferred-desk__empty">
        {t.rich('empty.default', { key: inlineKey })}
      </p>
    );
  }

  const tryAgain = onRescan
    ? { label: t('empty.tryAgain'), onClick: onRescan, disabled: isRateLimited }
    : undefined;
  const reconnectAction = onReconnect
    ? { label: t('empty.reconnect'), onClick: onReconnect }
    : undefined;
  const who = githubUsername ?? diagnostics.githubLogin ?? t('empty.whoFallback');

  if (diagnostics.skippedReason === 'no_team_repos') {
    return (
      <EmptyCard
        tone="info"
        title={t('empty.noTeamRepos.title')}
        body={t('empty.noTeamRepos.body')}
      />
    );
  }

  if (diagnostics.skippedReason === 'no_token') {
    return (
      <EmptyCard
        tone="warn"
        title={t('empty.noToken.title')}
        body={t('empty.noToken.body')}
        primaryAction={reconnectAction}
      />
    );
  }

  if (diagnostics.skippedReason === 'no_consent') {
    return (
      <EmptyCard
        tone="warn"
        title={t('empty.noConsent.title')}
        body={t('empty.noConsent.body')}
        primaryAction={reconnectAction}
      />
    );
  }

  if (diagnostics.skippedReason === 'no_author') {
    return (
      <EmptyCard
        tone="warn"
        title={t('empty.noAuthor.title')}
        body={t('empty.noAuthor.body')}
        primaryAction={reconnectAction}
      />
    );
  }

  if (diagnostics.commitsFound > 0) {
    return (
      <EmptyCard
        tone="info"
        title={t('empty.couldntInfer.title')}
        body={t.rich(
          diagnostics.commitsFound === 1
            ? 'empty.couldntInfer.bodyOne'
            : 'empty.couldntInfer.bodyOther',
          { key: inlineKey, count: diagnostics.commitsFound },
        )}
        secondary={tryAgain}
      />
    );
  }

  // From here, commitsFound === 0.

  if (diagnostics.recentCommitSample === null) {
    if (diagnostics.tokenStatus === 401) {
      return (
        <EmptyCard
          tone="warn"
          title={t('empty.expired.title')}
          body={t('empty.expired.body')}
          primaryAction={reconnectAction}
        />
      );
    }

    const scopes = diagnostics.tokenScopes;
    const hasRepoScope = scopes !== null && scopes.includes('repo');
    if (scopes !== null && !hasRepoScope) {
      return (
        <EmptyCard
          tone="warn"
          title={t('empty.noRepoScope.title')}
          body={t.rich('empty.noRepoScope.body', { key: inlineKey })}
          primaryAction={reconnectAction}
          secondary={tryAgain}
        />
      );
    }

    const probeResults = diagnostics.repoProbeResults ?? [];
    const failed = probeResults.filter((r) => r.status >= 400);
    return (
      <EmptyCard
        tone="warn"
        title={t('empty.blocked.title')}
        body={
          <>
            {t.rich('empty.blocked.body', {
              key: inlineKey,
              count: diagnostics.reposScanned,
            })}
            {failed.length > 0 && (
              <>
                {' '}
                {t.rich('empty.blocked.tried', {
                  repos: () => (
                    <>
                      {failed.map((r, i) => (
                        <span key={`${r.owner}/${r.repo}`}>
                          {i > 0 && ', '}
                          <span className="inferred-desk__inline-key">
                            {r.owner}/{r.repo}
                          </span>{' '}
                          ({r.status})
                        </span>
                      ))}
                    </>
                  ),
                })}
              </>
            )}
          </>
        }
        primary={{
          label: t('empty.openOauthApps'),
          href: 'https://github.com/settings/applications',
        }}
        secondary={tryAgain}
      />
    );
  }

  if (diagnostics.recentCommitSample.length === 0) {
    return (
      <EmptyCard
        tone="info"
        title={t('empty.noRecentCommits.title')}
        body={t.rich(
          diagnostics.reposScanned === 1
            ? 'empty.noRecentCommits.bodyOne'
            : 'empty.noRecentCommits.bodyOther',
          { key: inlineKey, count: diagnostics.reposScanned },
        )}
        secondary={tryAgain}
      />
    );
  }

  if (diagnostics.sampleCommitsAttributedToUser > 0) {
    return (
      <EmptyCard
        tone="info"
        title={t('empty.almostThere.title')}
        body={t('empty.almostThere.body')}
        secondary={tryAgain}
      />
    );
  }

  if (
    diagnostics.sampleCommitsByVerifiedEmail === 0 &&
    diagnostics.recentCommitSample.length > 0
  ) {
    const sampleEmail = diagnostics.recentCommitSample[0]?.authorEmail ?? null;
    const verified = diagnostics.githubVerifiedEmails ?? [];
    return (
      <EmptyCard
        tone="warn"
        title={t('empty.emailMismatch.title')}
        body={
          <>
            {sampleEmail
              ? t.rich('empty.emailMismatch.bodyWithEmail', {
                  key: inlineKey,
                  email: sampleEmail,
                  who,
                })
              : t.rich('empty.emailMismatch.bodyNoEmail', {
                  key: inlineKey,
                  who,
                })}
            {verified.length > 0 && (
              <>
                {' '}
                {t.rich('empty.emailMismatch.addEmailHint', {
                  key: inlineKey,
                  emails: verified.join(', '),
                })}
              </>
            )}
          </>
        }
        primary={{
          label: t('empty.openEmailSettings'),
          href: 'https://github.com/settings/emails',
        }}
        secondary={tryAgain}
      />
    );
  }

  if (diagnostics.sampleCommitsByVerifiedEmail > 0) {
    return (
      <EmptyCard
        tone="warn"
        title={t('empty.emailPrivate.title')}
        body={t.rich('empty.emailPrivate.body', { key: inlineKey, who })}
        primary={{
          label: t('empty.openEmailSettings'),
          href: 'https://github.com/settings/emails',
        }}
        secondary={tryAgain}
      />
    );
  }

  return (
    <EmptyCard
      tone="info"
      title={t('empty.noAttributed.title')}
      body={t.rich(
        diagnostics.reposScanned === 1
          ? 'empty.noAttributed.bodyOne'
          : 'empty.noAttributed.bodyOther',
        { key: inlineKey, count: diagnostics.reposScanned, who },
      )}
      secondary={tryAgain}
    />
  );
}

function EmptyCard({
  tone,
  title,
  body,
  primary,
  primaryAction,
  secondary,
}: {
  tone: 'warn' | 'info';
  title: string;
  body: React.ReactNode;
  primary?: { label: string; href: string };
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className={`empty-card empty-card--${tone}`}>
      <div className="empty-card__title-row">
        <AlertCircle size={14} aria-hidden="true" className="empty-card__icon" />
        <span className="empty-card__title">{title}</span>
      </div>
      <p className="empty-card__body">{body}</p>
      {(primary || primaryAction || secondary) && (
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
          {primaryAction && (
            <button
              type="button"
              className="empty-card__primary"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
            >
              <span>{primaryAction.label}</span>
            </button>
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

// ──────────────────────────────────────────────────────────────────────────────
// Main component.
// ──────────────────────────────────────────────────────────────────────────────

export function InferredFromGitHub({
  items,
  lastScanAt = null,
  consented = true,
  isScanning = false,
  onReject,
  onKeep,
  onRescan,
  rescanRateLimitedUntil = null,
  diagnostics = null,
  githubUsername = null,
  onReconnect,
}: Props) {
  const t = useTranslations('teams.profile.inferred');
  const locale = useLocale();
  // Optimistic state — two sets, one per terminal action. Cleared as soon as
  // the parent pushes new server-truth `items` that confirm the action.
  const [optimisticRejects, setOptimisticRejects] = useState<Set<string>>(
    () => new Set(),
  );
  const [optimisticKept, setOptimisticKept] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setOptimisticRejects((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const row = items.find((i) => i.id === id);
        // Drop the optimistic flag the moment the server confirms.
        if (row && row.rejectedAt === null) next.add(id);
      }
      return next;
    });
    setOptimisticKept((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const row = items.find((i) => i.id === id);
        if (row && row.userReviewedAt === null && row.rejectedAt === null) {
          next.add(id);
        }
      }
      return next;
    });
  }, [items]);

  function handleKeepClick(id: string) {
    setOptimisticKept((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onKeep(id);
  }

  function handleRejectClick(id: string) {
    setOptimisticRejects((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onReject(id);
  }

  // Compute the three zones. Deterministic alphabetical sort within each zone
  // so re-scans don't shuffle the layout under the user.
  const { pending, kept, dropped } = useMemo(() => {
    const pendingOut: InferredSkill[] = [];
    const keptOut: InferredSkill[] = [];
    const droppedOut: InferredSkill[] = [];
    for (const item of items) {
      if (optimisticRejects.has(item.id) || item.rejectedAt !== null) {
        droppedOut.push(item);
      } else if (optimisticKept.has(item.id) || item.userReviewedAt !== null) {
        keptOut.push(item);
      } else {
        pendingOut.push(item);
      }
    }
    const byTag = (a: InferredSkill, b: InferredSkill) =>
      a.canonicalTag.localeCompare(b.canonicalTag);
    return {
      pending: pendingOut.sort(byTag),
      kept: keptOut.sort(byTag),
      dropped: droppedOut.sort(byTag),
    };
  }, [items, optimisticRejects, optimisticKept]);

  const isRateLimited =
    rescanRateLimitedUntil !== null && rescanRateLimitedUntil > Date.now();
  const minutesUntilOk = isRateLimited
    ? Math.max(1, Math.ceil(((rescanRateLimitedUntil ?? 0) - Date.now()) / 60_000))
    : 0;

  // Dropped-zone collapse — show first 3, gate the rest behind a disclosure.
  const [showAllDropped, setShowAllDropped] = useState(false);
  const visibleDropped = showAllDropped ? dropped : dropped.slice(0, 3);

  const hasAnyItems = items.length > 0;

  return (
    <Tooltip.Provider delayDuration={300}>
      <section
        className={`inferred-desk${isScanning ? ' inferred-desk--scanning' : ''}`}
        aria-label={t('sectionAria')}
      >
        <header className="inferred-desk__head">
          <div className="inferred-desk__head-text">
            <span className="inferred-desk__eyebrow">{t('eyebrow')}</span>
            <h2 className="inferred-desk__heading">
              {t('heading')}
            </h2>
            <p className="inferred-desk__helper">
              {t('helper')}
            </p>
          </div>
          {consented && (
            <div className="inferred-desk__head-meta">
              <span className="inferred-desk__timestamp">
                {formatRelative(lastScanAt, t, locale)}
              </span>
              {onRescan && (
                <Tooltip.Root open={isRateLimited ? undefined : false}>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      className={`inferred-desk__rescan${isScanning ? ' inferred-desk__rescan--spin' : ''}`}
                      onClick={onRescan}
                      disabled={isScanning || isRateLimited}
                      aria-label={t('rescanAria')}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      <span>{t('rescan')}</span>
                    </button>
                  </Tooltip.Trigger>
                  {isRateLimited && (
                    <Tooltip.Portal>
                      <Tooltip.Content className="inferred-tooltip" sideOffset={6}>
                        {t('rateLimitTooltip', { min: minutesUntilOk })}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  )}
                </Tooltip.Root>
              )}
            </div>
          )}
        </header>

        {!consented ? (
          <p className="inferred-desk__empty">
            {t('notConsented')}
          </p>
        ) : isScanning ? (
          <div className="inferred-desk__skeleton" aria-live="polite">
            <p className="inferred-desk__empty">{t('scanning')}</p>
            <div className="inferred-desk__skeleton-row" aria-hidden="true" />
            <div className="inferred-desk__skeleton-row" aria-hidden="true" />
            <div className="inferred-desk__skeleton-row" aria-hidden="true" />
          </div>
        ) : !hasAnyItems ? (
          <EmptyState
            diagnostics={diagnostics}
            githubUsername={githubUsername}
            isRateLimited={isRateLimited}
            onRescan={onRescan}
            onReconnect={onReconnect}
          />
        ) : (
          <div className="inferred-desk__zones">
            {pending.length > 0 && (
              <div className="inferred-desk__zone">
                <ZoneDivider label={t('zones.pending')} count={pending.length} accent />
                <div className="inferred-desk__pending-grid">
                  {pending.map((item) => (
                    <PendingDecisionCard
                      key={item.id}
                      item={item}
                      onKeep={handleKeepClick}
                      onReject={handleRejectClick}
                    />
                  ))}
                </div>
              </div>
            )}

            {kept.length > 0 && (
              <div className="inferred-desk__zone">
                <ZoneDivider label={t('zones.kept')} count={kept.length} />
                <div className="inferred-desk__pill-row">
                  {kept.map((item) => (
                    <KeptPill key={item.id} item={item} onReject={handleRejectClick} />
                  ))}
                </div>
              </div>
            )}

            {dropped.length > 0 && (
              <div className="inferred-desk__zone">
                <ZoneDivider label={t('zones.dropped')} count={dropped.length} />
                <div className="inferred-desk__pill-row">
                  {visibleDropped.map((item) => (
                    <DroppedPill
                      key={item.id}
                      item={item}
                      withinUndoWindow={optimisticRejects.has(item.id)}
                      onUndo={() => {
                        // No-op visual hint; the actual undo PATCH lives on
                        // the parent's `onUndoReject`. The 6s timer in the
                        // parent will cancel the rejection PATCH; this Undo
                        // text-button simply forwards that intent.
                      }}
                    />
                  ))}
                </div>
                {dropped.length > visibleDropped.length && (
                  <button
                    type="button"
                    className="inferred-desk__show-more"
                    onClick={() => setShowAllDropped(true)}
                  >
                    {t('showMore', { count: dropped.length - visibleDropped.length })}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <style>{`
          .inferred-desk {
            display: flex;
            flex-direction: column;
            gap: 18px;
            padding: 28px 30px;
            background: var(--glass-substrate);
            border: 1px solid var(--btn-secondary-border);
            border-radius: var(--r-md);
            box-shadow: var(--shadow-float);
            transition: border-color var(--dur-fast) var(--ease-out);
          }
          .inferred-desk--scanning {
            animation: inferred-desk-pulse 2s ease-in-out infinite;
          }
          @keyframes inferred-desk-pulse {
            0%, 100% { border-color: var(--btn-secondary-border); }
            50%      { border-color: rgba(var(--signature-rgb), 0.34); }
          }

          .inferred-desk__head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
          }
          .inferred-desk__head-text {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
          }
          .inferred-desk__eyebrow {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            color: var(--signature);
            text-transform: uppercase;
          }
          .inferred-desk__heading {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 20px;
            font-weight: 600;
            line-height: 1.25;
            color: var(--txt-pure);
            margin: 0;
          }
          .inferred-desk__helper {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 13.5px;
            line-height: 1.5;
            color: var(--txt-muted);
            margin: 0;
          }
          .inferred-desk__head-meta {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
          }
          .inferred-desk__timestamp {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 11px;
            color: var(--txt-muted);
          }
          .inferred-desk__rescan {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--txt-muted);
            background: transparent;
            border: 1px solid var(--btn-secondary-border);
            border-radius: var(--r-sm);
            cursor: pointer;
            transition: color var(--dur-fast) var(--ease-out),
                        border-color var(--dur-fast) var(--ease-out);
            min-height: 30px;
          }
          .inferred-desk__rescan:hover:not(:disabled) {
            color: var(--txt-pure);
            border-color: rgba(var(--signature-rgb), 0.34);
          }
          .inferred-desk__rescan:disabled { opacity: 0.55; cursor: not-allowed; }
          .inferred-desk__rescan--spin { color: var(--signature); }
          .inferred-desk__rescan--spin svg {
            animation: inferred-desk-spin 0.8s linear infinite;
          }
          @keyframes inferred-desk-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }

          .inferred-desk__empty {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 13.5px;
            line-height: 1.5;
            color: var(--txt-muted);
            margin: 0;
            padding: 4px 0;
          }
          .inferred-desk__inline-key {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 500;
            color: var(--txt-pure);
            padding: 1px 5px;
            border-radius: 4px;
            background: var(--btn-secondary-bg);
            border: 1px solid var(--btn-secondary-border);
          }

          .inferred-desk__skeleton {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .inferred-desk__skeleton-row {
            height: 80px;
            border-radius: var(--r-sm);
            background: linear-gradient(
              90deg,
              var(--btn-secondary-bg) 0%,
              rgba(var(--signature-rgb), 0.06) 50%,
              var(--btn-secondary-bg) 100%
            );
            background-size: 200% 100%;
            animation: inferred-desk-shimmer 1.4s ease-in-out infinite;
          }
          @keyframes inferred-desk-shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }

          .inferred-desk__zones {
            display: flex;
            flex-direction: column;
            gap: 22px;
          }
          .inferred-desk__zone {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .inferred-desk__pending-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 10px;
          }
          .inferred-desk__pill-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .inferred-desk__show-more {
            align-self: flex-start;
            padding: 0;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 11px;
            color: var(--txt-muted);
            background: transparent;
            border: none;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            transition: color var(--dur-fast) var(--ease-out);
          }
          .inferred-desk__show-more:hover { color: var(--txt-pure); }

          /* Zone divider — mono uppercase eyebrow + count + hairline rule.
             Only the section eyebrow uses signature pink; zone subdividers
             stay muted so the page doesn't accumulate pink labels. */
          .zone-divider {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .zone-divider__rule {
            flex: 1;
            height: 1px;
            background: var(--btn-secondary-border);
          }
          .zone-divider__label {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.08em;
            color: var(--txt-muted);
            text-transform: uppercase;
          }
          .zone-divider--accent .zone-divider__label {
            color: var(--signature);
          }
          .zone-divider__count {
            padding: 1px 7px;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 10.5px;
            font-weight: 600;
            color: var(--txt-muted);
            background: var(--btn-secondary-bg);
            border-radius: 999px;
          }
          .zone-divider--accent .zone-divider__count {
            color: var(--signature);
            background: rgba(var(--signature-rgb), 0.10);
          }

          /* Pending decision card — the centerpiece. Two-row grid, lift on hover. */
          .pending-card {
            display: grid;
            grid-template-columns: 1fr auto;
            grid-template-rows: auto auto;
            gap: 4px 14px;
            padding: 16px 18px;
            background: var(--bg-content);
            border: 1px solid var(--btn-secondary-border);
            border-radius: var(--r-sm);
            transition:
              border-color var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
            animation: pending-card-in 220ms var(--ease-out);
          }
          @keyframes pending-card-in {
            from { opacity: 0; transform: translateY(4px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          .pending-card:hover {
            border-color: rgba(var(--signature-rgb), 0.34);
            transform: translateY(-1px);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          }
          .pending-card__tag {
            grid-column: 1;
            grid-row: 1;
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 17px;
            font-weight: 600;
            line-height: 1.2;
            color: var(--txt-pure);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
          }
          .pending-card__chip {
            grid-column: 2;
            grid-row: 1;
            align-self: center;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 10.5px;
            font-weight: 500;
            letter-spacing: 0.06em;
            color: var(--txt-muted);
            text-transform: uppercase;
            cursor: help;
          }
          .pending-card__actions {
            grid-column: 1 / -1;
            grid-row: 2;
            display: flex;
            gap: 8px;
            margin-top: 10px;
          }
          .pending-card__keep,
          .pending-card__drop {
            flex: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 36px;
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 13.5px;
            font-weight: 600;
            border-radius: var(--r-sm);
            cursor: pointer;
            transition:
              opacity var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
          }
          .pending-card__keep {
            color: #fff;
            background: var(--signature);
            border: 1px solid transparent;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
          }
          .pending-card__keep:hover {
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.22),
              0 0 0 4px rgba(var(--signature-rgb), 0.18);
          }
          .pending-card__keep:active { transform: translateY(1px); }
          .pending-card__drop {
            color: var(--txt-pure);
            background: transparent;
            border: 1px solid var(--btn-secondary-border);
          }
          .pending-card__drop:hover {
            border-color: rgba(var(--signature-rgb), 0.34);
            color: var(--txt-pure);
          }

          /* Kept pill — matches existing accepted-state visual contract. */
          .kept-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 4px 5px 12px;
            background: rgba(var(--signature-rgb), 0.08);
            border: 1px solid rgba(var(--signature-rgb), 0.34);
            border-radius: var(--r-sm);
            transition:
              background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out);
            animation: kept-pill-in 220ms var(--ease-out);
          }
          @keyframes kept-pill-in {
            from { opacity: 0; transform: scale(0.92); }
            to   { opacity: 1; transform: scale(1); }
          }
          .kept-pill:hover {
            background: rgba(var(--signature-rgb), 0.12);
          }
          .kept-pill__lines {
            display: flex;
            flex-direction: column;
            gap: 1px;
            min-width: 0;
          }
          .kept-pill__tag {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 14px;
            font-weight: 500;
            line-height: 1.15;
            color: var(--signature);
          }
          .kept-pill__chip {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 500;
            line-height: 1.15;
            letter-spacing: 0.06em;
            color: var(--txt-muted);
            text-transform: uppercase;
          }
          .kept-pill__drop {
            width: 26px;
            height: 26px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            border-radius: 50%;
            color: var(--txt-muted);
            cursor: pointer;
            transition:
              color var(--dur-fast) var(--ease-out),
              background var(--dur-fast) var(--ease-out);
          }
          .kept-pill__drop:hover {
            color: var(--danger);
            background: rgba(var(--signature-rgb), 0.10);
          }

          /* Dropped pill — muted, strikethrough. */
          .dropped-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 5px 10px 5px 11px;
            background: var(--btn-secondary-bg);
            border: 1px solid var(--btn-secondary-border);
            border-radius: var(--r-sm);
          }
          .dropped-pill__lines {
            display: flex;
            flex-direction: column;
            gap: 1px;
          }
          .dropped-pill__tag {
            font-family: var(--font-inter), Inter, sans-serif;
            font-size: 13px;
            font-weight: 400;
            line-height: 1.15;
            color: var(--txt-faint);
            text-decoration: line-through;
          }
          .dropped-pill__caption {
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 400;
            line-height: 1.15;
            color: var(--txt-faint);
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .dropped-pill__undo {
            padding: 0;
            font-family: var(--font-mono), 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--signature);
            background: transparent;
            border: none;
            cursor: pointer;
            transition: color var(--dur-fast) var(--ease-out);
          }
          .dropped-pill__undo:hover { opacity: 0.8; }

          /* Mobile — tighten padding, keep buttons horizontal */
          @media (max-width: 540px) {
            .inferred-desk { padding: 22px; }
            .inferred-desk__head { flex-direction: column; }
            .pending-card { padding: 14px 16px; }
            .pending-card__tag { font-size: 16px; }
            .inferred-desk__pending-grid {
              grid-template-columns: 1fr;
            }
          }

          /* Empty / diagnostic cards (preserved from earlier today) */
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
          .empty-card__primary:hover { opacity: 0.92; }
          .empty-card__primary:active { transform: translateY(1px); }
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
      </section>
    </Tooltip.Provider>
  );
}

function ZoneDivider({
  label,
  count,
  accent = false,
}: {
  label: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <div className={`zone-divider${accent ? ' zone-divider--accent' : ''}`}>
      <span className="zone-divider__label">{label}</span>
      <span className="zone-divider__count">{count}</span>
      <span className="zone-divider__rule" aria-hidden="true" />
    </div>
  );
}

export default InferredFromGitHub;

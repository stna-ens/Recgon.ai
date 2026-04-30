'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/Toast';
import type { VerificationEvidence, VerificationStatus } from '@/lib/recgon/types';
import { stripMd } from '@/lib/strings';
import { ProofDropZone } from '@/components/ProofDropZone';
import { TaskStatusChip } from '@/components/TaskStatusChip';
import '../teams/[id]/tasks/tasks.css';

type InboxTask = {
  id: string;
  team_id: string;
  teamName: string;
  project_id: string | null;
  title: string;
  description: string;
  kind: string;
  source: string;
  priority: number;
  status: 'assigned' | 'accepted' | 'in_progress' | 'awaiting_review';
  assigned_at: string;
  deadline: string | null;
  result: Record<string, unknown> | null;
  verification_status: VerificationStatus;
  verification_evidence: VerificationEvidence | null;
};

const KIND_LABEL: Record<string, string> = {
  next_step: 'Next step',
  dev_prompt: 'Dev prompt',
  marketing: 'Marketing',
  analytics: 'Analytics',
  research: 'Research',
  custom: 'Task',
};

type FilterKey = 'all' | 'needs_you' | 'in_review';
const FILTERS: ReadonlyArray<FilterKey> = ['all', 'needs_you', 'in_review'];
const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'All',
  needs_you: 'Needs you',
  in_review: 'In review',
};

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

// Only surface priority when it's notable. Normal/Low don't earn a badge.
function priorityBadge(priority: number): { label: string; color: string } | null {
  if (priority <= 0) return { label: 'Urgent', color: '#ef4444' };
  if (priority === 1) return { label: 'High', color: '#f59e0b' };
  return null;
}

// Rows that need *your* action drive the attention stripe + dot. Everything
// else stays neutral so the urgent ones pop.
function isAttention(t: InboxTask): boolean {
  return (
    t.verification_status === 'proof_requested' ||
    t.verification_status === 'failed' ||
    t.status === 'assigned'
  );
}

function InboxPageInner() {
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterFromUrl = searchParams.get('view');
  const initialFilter: FilterKey =
    filterFromUrl && (FILTERS as readonly string[]).includes(filterFromUrl)
      ? (filterFromUrl as FilterKey)
      : 'all';
  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({});
  const [proofLinks, setProofLinks] = useState<Record<string, string>>({});
  const [proofExpanded, setProofExpanded] = useState<Record<string, boolean>>({});
  const [proofAttachments, setProofAttachments] = useState<Record<string, Array<{ name: string; url: string }>>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/inbox');
    if (res.ok) {
      const { tasks } = await res.json();
      setTasks(tasks);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Sync the active filter to the URL so refresh / share preserves it.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === 'all') params.delete('view');
    else params.set('view', filter);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Poll while any task is mid-verification so per-stage tooltip text catches
  // the transitions. Pauses when the tab is hidden so background tabs don't
  // hammer the API.
  useEffect(() => {
    const verifying = tasks.some(
      (t) => t.verification_status === 'auto_running' || t.verification_status === 'proof_evaluating',
    );
    if (!verifying) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 1500);
    return () => clearInterval(id);
  }, [tasks, refresh]);

  const filtered = useMemo(() => {
    if (filter === 'needs_you') return tasks.filter(isAttention);
    if (filter === 'in_review') return tasks.filter((t) => t.status === 'awaiting_review');
    return tasks;
  }, [filter, tasks]);

  const filterCounts = useMemo(() => ({
    all: tasks.length,
    needs_you: tasks.filter(isAttention).length,
    in_review: tasks.filter((t) => t.status === 'awaiting_review').length,
  }), [tasks]);

  const grouped = useMemo(() => {
    const open = filtered.filter((t) => t.status !== 'awaiting_review');
    const review = filtered.filter((t) => t.status === 'awaiting_review');
    open.sort((a, b) => {
      const aAtt = isAttention(a), bAtt = isAttention(b);
      if (aAtt !== bAtt) return aAtt ? -1 : 1;
      return new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime();
    });
    return { open, review };
  }, [filtered]);

  const uploadProofFiles = useCallback(async (task: InboxTask, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(task.id);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/proof/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Upload failed');
      }
      const { attachments } = (await res.json()) as { attachments: Array<{ name: string; url: string }> };
      setProofAttachments((p) => ({ ...p, [task.id]: [...(p[task.id] ?? []), ...attachments] }));
      addToast(`${attachments.length} file${attachments.length === 1 ? '' : 's'} attached`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(null);
    }
  }, [addToast]);

  const removeAttachment = useCallback((taskId: string, index: number) => {
    setProofAttachments((p) => ({
      ...p,
      [taskId]: (p[taskId] ?? []).filter((_, i) => i !== index),
    }));
  }, []);

  const submitProof = useCallback(async (task: InboxTask) => {
    // Guard: never let the same in-flight submit fire again — that's how
    // duplicate proofs got submitted before.
    if (working === task.id) return;
    const text = (proofDrafts[task.id] ?? '').trim();
    const linksRaw = (proofLinks[task.id] ?? '').trim();
    const links = linksRaw ? linksRaw.split(/\s+/).filter(Boolean) : [];
    const attachments = proofAttachments[task.id] ?? [];
    if (!text && links.length === 0 && attachments.length === 0) {
      addToast('Add a note, a link, or a file before submitting.', 'error');
      return;
    }
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text || undefined,
          links: links.length ? links : undefined,
          attachments: attachments.length ? attachments : undefined,
          submittedAt: new Date().toISOString(),
          submittedBy: 'self',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Proof submit failed');
      }
      addToast('Proof sent — Recgon is re-checking', 'success');
      setProofDrafts((p) => ({ ...p, [task.id]: '' }));
      setProofLinks((p) => ({ ...p, [task.id]: '' }));
      setProofExpanded((p) => ({ ...p, [task.id]: false }));
      setProofAttachments((p) => ({ ...p, [task.id]: [] }));
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, proofDrafts, proofLinks, proofAttachments, addToast, refresh]);

  const act = useCallback(
    async (task: InboxTask, action: 'accept' | 'decline' | 'complete') => {
      setWorking(task.id);
      try {
        const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `${action} failed`);
        }
        if (action === 'decline') {
          const { reassignedTo, ownerFallback } = await res.json();
          addToast(
            ownerFallback
              ? 'Declined — sent to team owner to decide'
              : reassignedTo
                ? 'Declined — Recgon reassigned'
                : 'Declined — Recgon will reassign',
            'success',
          );
        } else {
          addToast(action === 'accept' ? 'Accepted' : 'Marked complete', 'success');
        }
        await refresh();
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed', 'error');
      } finally {
        setWorking(null);
      }
    },
    [addToast, refresh],
  );

  const renderRow = (t: InboxTask, index: number) => {
    const attention = isAttention(t);
    const isReview = t.status === 'awaiting_review';
    const accent = attention
      ? (t.verification_status === 'failed' ? '#ef4444' : '#f59e0b')
      : null;
    const accentVar = accent
      ? { ['--rg-accent' as string]: accent, ['--rg-accent-glow' as string]: `0 0 12px ${accent}55` }
      : {};

    const cleanTitle = stripMd(t.title);
    const cleanDescription = stripMd(t.description);
    const summary =
      t.result && typeof (t.result as { summary?: string }).summary === 'string'
        ? (t.result as { summary: string }).summary
        : null;
    const showProofForm = t.verification_status === 'proof_requested';
    const pBadge = priorityBadge(t.priority);
    const busy = working === t.id;

    return (
      <div
        key={t.id}
        className="glass-card rg-row"
        data-attention={attention ? 'true' : undefined}
        data-closed={isReview ? 'true' : undefined}
        title={t.id}
        style={{ ['--rg-row-i' as string]: index, ...accentVar } as React.CSSProperties}
      >
        <div className="rg-row__top">
          <div className="rg-row__main">
            <div className="rg-row__title">
              {attention && <span className="rg-attention-dot" aria-hidden />}
              {cleanTitle}
            </div>
            {cleanDescription && (
              <p className="rg-row__description">{cleanDescription}</p>
            )}
            {summary && <p className="rg-row__summary">{summary}</p>}

            <div className="rg-row__meta">
              <TaskStatusChip
                status={t.status}
                verification={t.verification_status}
                evidence={t.verification_evidence}
              />
              {pBadge && (
                <span className="rg-meta-priority" style={{ color: pBadge.color }} title={`Priority ${t.priority}`}>
                  {pBadge.label}
                </span>
              )}
              {t.kind !== 'custom' && (
                <span className="rg-meta-kind">{KIND_LABEL[t.kind] ?? t.kind}</span>
              )}
              <Link
                href={`/teams/${t.team_id}/tasks`}
                className="rg-meta-team"
                title={`Open ${t.teamName} tasks`}
              >
                {t.teamName}
              </Link>
              {t.assigned_at && (
                <span className="rg-meta-time" title={new Date(t.assigned_at).toLocaleString()}>
                  {relTime(t.assigned_at)}
                </span>
              )}
            </div>

            {showProofForm && (
              <div className="rg-proof">
                <div className="rg-proof__stamp">Proof requested</div>
                <p className="rg-proof__hint">
                  Recgon couldn&apos;t auto-verify this. Send a note, a link, or a file and Recgon will re-judge.
                </p>
                {!proofExpanded[t.id] ? (
                  <button
                    onClick={() => setProofExpanded((p) => ({ ...p, [t.id]: true }))}
                    disabled={busy}
                    className="rg-action"
                    data-tone="warn"
                  >
                    Open proof form
                  </button>
                ) : (
                  <>
                    <textarea
                      placeholder="Describe what you did."
                      value={proofDrafts[t.id] ?? ''}
                      onChange={(e) => setProofDrafts((p) => ({ ...p, [t.id]: e.target.value }))}
                      rows={3}
                      className="rg-input"
                      style={{ marginBottom: 6, resize: 'vertical' }}
                    />
                    <input
                      placeholder="Proof links (separate with spaces)"
                      value={proofLinks[t.id] ?? ''}
                      onChange={(e) => setProofLinks((p) => ({ ...p, [t.id]: e.target.value }))}
                      className="rg-input rg-input--sm"
                      style={{ marginBottom: 6 }}
                    />
                    <ProofDropZone
                      uploading={uploading === t.id}
                      files={proofAttachments[t.id] ?? []}
                      onPick={(files) => uploadProofFiles(t, files)}
                      onRemove={(idx) => removeAttachment(t.id, idx)}
                    />
                    <p className="rg-proof__footnote">
                      Recgon will fetch any URL you paste and judge the page itself — not just your description.
                    </p>
                    <div className="rg-proof__actions">
                      <button
                        onClick={() => submitProof(t)}
                        disabled={busy}
                        className="rg-action"
                        data-tone="warn"
                      >
                        {busy && (
                          <span
                            aria-hidden
                            style={{
                              width: 10, height: 10, borderRadius: '50%',
                              border: '2px solid rgba(255,255,255,0.4)',
                              borderTopColor: 'white',
                              animation: 'recgon-spin 0.7s linear infinite',
                              display: 'inline-block',
                            }}
                          />
                        )}
                        {busy ? 'Submitting…' : 'Submit proof'}
                      </button>
                      <button
                        onClick={() => setProofExpanded((p) => ({ ...p, [t.id]: false }))}
                        disabled={busy}
                        className="rg-action"
                        data-tone="ghost"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {!isReview && !showProofForm && (
            <div className="rg-row__actions">
              {t.status === 'assigned' && (
                <>
                  <button
                    onClick={() => act(t, 'accept')}
                    disabled={busy}
                    className="rg-action"
                    data-tone="primary"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => act(t, 'decline')}
                    disabled={busy}
                    className="rg-action"
                    data-tone="ghost"
                  >
                    Decline
                  </button>
                </>
              )}
              {(t.status === 'accepted' || t.status === 'in_progress') && (
                <>
                  <button
                    onClick={() => act(t, 'complete')}
                    disabled={busy}
                    className="rg-action"
                    data-tone="primary"
                  >
                    Mark done
                  </button>
                  <button
                    onClick={() => act(t, 'decline')}
                    disabled={busy}
                    className="rg-action"
                    data-tone="ghost"
                  >
                    Hand back
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rg-tasks-page" style={{ maxWidth: 1080 }}>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>inbox</h2>
        <p>Tasks Recgon assigned to you across every team.</p>
      </div>

      <div className="rg-filters" role="tablist" aria-label="Filter inbox">
        {FILTERS.map((f) => {
          const active = filter === f;
          const count = filterCounts[f] ?? 0;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-pressed={active}
              onClick={() => setFilter(f)}
              className="rg-filter-btn"
              data-tone={f === 'needs_you' && count > 0 ? 'warn' : undefined}
            >
              {FILTER_LABEL[f]}
              <span className="rg-filter-btn__count">{count}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="rg-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card rg-skel" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rg-empty">
          <h2 className="rg-empty__title">
            {filter === 'all' && "You're clear."}
            {filter === 'needs_you' && 'Nothing needs you right now.'}
            {filter === 'in_review' && 'Nothing in review.'}
          </h2>
          <p className="rg-empty__body">
            {filter === 'all' && 'Recgon will drop tasks here as they come in across your teams.'}
            {filter === 'needs_you' && "You're up to date. New work will appear here when Recgon assigns it to you."}
            {filter === 'in_review' && 'Tasks Recgon is checking will land here.'}
          </p>
          {filter !== 'all' ? (
            <button onClick={() => setFilter('all')} className="rg-action" data-tone="ghost">
              Show all
            </button>
          ) : (
            <Link
              href="/teams"
              className="rg-action"
              data-tone="ghost"
              style={{ textDecoration: 'none' }}
            >
              Browse teams
            </Link>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && filter === 'all' && (
        <>
          {grouped.open.length > 0 && (
            <>
              <div className="rg-section-head">
                <span className="rg-section-head__label">Open · {grouped.open.length}</span>
                <span className="rg-section-head__line" aria-hidden />
              </div>
              <div className="rg-list">
                {grouped.open.map((t, i) => renderRow(t, i))}
              </div>
            </>
          )}
          {grouped.review.length > 0 && (
            <>
              <div className="rg-section-head">
                <span className="rg-section-head__label">In review · {grouped.review.length}</span>
                <span className="rg-section-head__line" aria-hidden />
              </div>
              <div className="rg-list">
                {grouped.review.map((t, i) => renderRow(t, i))}
              </div>
            </>
          )}
        </>
      )}

      {!loading && filtered.length > 0 && filter !== 'all' && (
        <div className="rg-list">
          {filtered.map((t, i) => renderRow(t, i))}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

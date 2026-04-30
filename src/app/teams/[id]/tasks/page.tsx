'use client';

import { useCallback, useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/Toast';
import Select from '@/components/Select';
import { stripMd } from '@/lib/strings';
import { ProofDropZone } from '@/components/ProofDropZone';
import { TaskStatusChip } from '@/components/TaskStatusChip';
import type {
  AgentTask,
  TeammateWithStats,
  TaskKind,
  TaskStatus,
} from '@/lib/recgon/types';
import './tasks.css';

const KIND_LABEL: Record<TaskKind, string> = {
  next_step: 'Next step',
  dev_prompt: 'Dev prompt',
  marketing: 'Marketing',
  analytics: 'Analytics',
  research: 'Research',
  custom: 'Task',
};

type FilterKey = 'all' | 'needs_you' | 'done';
const FILTERS: ReadonlyArray<FilterKey> = ['all', 'needs_you', 'done'];
const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'All',
  needs_you: 'Needs you',
  done: 'Done',
};

const CLOSED_STATUSES: ReadonlyArray<TaskStatus> = [
  'completed', 'cancelled', 'declined', 'failed',
];

// Only surface priority when it's notable (Urgent or High). Low and Normal
// are silent — every row claiming "Low priority" is just visual noise.
function priorityBadge(priority: number): { label: string; color: string } | null {
  if (priority <= 0) return { label: 'Urgent', color: '#ef4444' };
  if (priority === 1) return { label: 'High', color: '#f59e0b' };
  return null;
}

// Sort the open list so the rows that need attention always rise to the top.
function attentionScore(t: AgentTask): number {
  if (t.verificationStatus === 'proof_requested') return 0;
  if (t.verificationStatus === 'failed') return 1;
  if (t.status === 'awaiting_review') return 2;
  if (t.priority <= 1) return 3;
  if (t.status === 'in_progress' || t.status === 'accepted') return 4;
  if (t.status === 'assigned') return 5;
  return 6;
}

// Avatar bubble for a teammate. Falls back to a dashed placeholder when
// the row is unassigned.
function TeammateBubble({ tm }: { tm?: TeammateWithStats }) {
  if (!tm) {
    return <span className="rg-bubble" data-empty="true">·</span>;
  }
  const initial = (tm.displayName || '·').slice(0, 1).toUpperCase();
  const style = tm.avatarColor ? { background: tm.avatarColor } : undefined;
  return (
    <span className="rg-bubble" style={style} title={tm.displayName}>
      {tm.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tm.avatarUrl} alt="" />
      ) : initial}
    </span>
  );
}

function IconBtn({ onClick, title, color, children }: {
  onClick: () => void;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rg-icon-btn"
      style={{ ['--rg-icon-color' as string]: color } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

export default function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: teamId } = use(params);
  const { data: session } = useSession();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterFromUrl = searchParams.get('view');
  const initialFilter: FilterKey =
    filterFromUrl && (FILTERS as readonly string[]).includes(filterFromUrl)
      ? (filterFromUrl as FilterKey)
      : 'all';
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [teammates, setTeammates] = useState<TeammateWithStats[]>([]);
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', kind: 'custom' as TaskKind, priority: 2 });
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<'owner' | 'member' | 'viewer' | null>(null);
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({});
  const [proofLinks, setProofLinks] = useState<Record<string, string>>({});
  const [proofExpanded, setProofExpanded] = useState<Record<string, boolean>>({});
  const [proofAttachments, setProofAttachments] = useState<Record<string, Array<{ name: string; url: string }>>>({});
  const [proofUploading, setProofUploading] = useState<string | null>(null);
  const [proofSubmitting, setProofSubmitting] = useState<string | null>(null);
  const currentUserId = session?.user?.id ?? null;

  const refresh = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch(`/api/teams/${teamId}/tasks`),
      fetch(`/api/teams/${teamId}/teammates`),
      fetch(`/api/teams/${teamId}`),
    ]);
    if (r1.ok) setTasks((await r1.json()).tasks);
    if (r2.ok) setTeammates((await r2.json()).teammates);
    if (r3.ok) {
      const team = await r3.json();
      setTeamRole(team.role ?? null);
      setTeamName(team.name ?? null);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Sync the active filter to the URL so refresh / share preserves it.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === 'all') params.delete('view');
    else params.set('view', filter);
    // Drop legacy status param from the prior 7-status filter rail.
    params.delete('status');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const teammateById = (id: string | null) => teammates.find((t) => t.id === id);

  const isAttentionTask = useCallback((t: AgentTask): boolean => {
    if (!currentUserId || !t.assignedTo) return false;
    const assignee = teammates.find((tm) => tm.id === t.assignedTo);
    if (assignee?.userId !== currentUserId) return false;
    return t.verificationStatus === 'proof_requested' || t.verificationStatus === 'failed';
  }, [teammates, currentUserId]);

  const filtered = useMemo(() => {
    if (filter === 'needs_you') return tasks.filter(isAttentionTask);
    if (filter === 'done') return tasks.filter((t) => t.status === 'completed');
    return tasks;
  }, [filter, tasks, isAttentionTask]);

  const filterCounts = useMemo(() => ({
    all: tasks.length,
    needs_you: tasks.filter(isAttentionTask).length,
    done: tasks.filter((t) => t.status === 'completed').length,
  }), [tasks, isAttentionTask]);

  const grouped = useMemo(() => {
    const open: AgentTask[] = [];
    const closed: AgentTask[] = [];
    for (const t of filtered) {
      if ((CLOSED_STATUSES as ReadonlyArray<string>).includes(t.status)) closed.push(t);
      else open.push(t);
    }
    open.sort((a, b) => {
      const sa = attentionScore(a), sb = attentionScore(b);
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    closed.sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime());
    return { open, closed };
  }, [filtered]);

  const createTask = async () => {
    if (!draft.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('failed');
      addToast('Task created — Recgon assigning…', 'success');
      setDraft({ title: '', description: '', kind: 'custom', priority: 2 });
      setDraftOpen(false);
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  const reassign = async (taskId: string, teammateId: string | null) => {
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/reassign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teammateId }),
    });
    if (!res.ok) {
      addToast('Reassign failed', 'error');
      return;
    }
    addToast('Reassigned', 'success');
    await refresh();
  };

  const uploadProofFiles = async (taskId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProofUploading(taskId);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/proof/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Upload failed');
      }
      const { attachments } = (await res.json()) as { attachments: Array<{ name: string; url: string }> };
      setProofAttachments((p) => ({ ...p, [taskId]: [...(p[taskId] ?? []), ...attachments] }));
      addToast(`${attachments.length} file${attachments.length === 1 ? '' : 's'} attached`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setProofUploading(null);
    }
  };

  const removeProofAttachment = (taskId: string, index: number) => {
    setProofAttachments((p) => ({
      ...p,
      [taskId]: (p[taskId] ?? []).filter((_, i) => i !== index),
    }));
  };

  const submitProof = async (taskId: string) => {
    // Guard: never let the same in-flight submit fire again — that's how
    // the user previously sent the same proof three times.
    if (proofSubmitting === taskId) return;
    const text = (proofDrafts[taskId] ?? '').trim();
    const linkRaw = (proofLinks[taskId] ?? '').trim();
    const links = linkRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s));
    const attachments = proofAttachments[taskId] ?? [];
    if (!text && links.length === 0 && attachments.length === 0) {
      addToast('Add a note, link, or file before submitting', 'error');
      return;
    }
    setProofSubmitting(taskId);
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text || undefined,
          links: links.length ? links : undefined,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        addToast(d.error || 'Proof submission failed', 'error');
        return;
      }
      addToast('Proof submitted — Recgon evaluating…', 'success');
      setProofDrafts((p) => ({ ...p, [taskId]: '' }));
      setProofLinks((p) => ({ ...p, [taskId]: '' }));
      setProofExpanded((p) => ({ ...p, [taskId]: false }));
      setProofAttachments((p) => ({ ...p, [taskId]: [] }));
      await refresh();
    } finally {
      setProofSubmitting(null);
    }
  };

  const ownerOverride = async (taskId: string) => {
    if (!confirm('Mark this task complete and bypass verification?')) return;
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      addToast(d.error || 'Override failed', 'error');
      return;
    }
    addToast('Marked complete (owner override)', 'success');
    await refresh();
  };

  const markDone = async (taskId: string) => {
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      addToast(d.error || 'Failed to mark done', 'error');
      return;
    }
    addToast('Sent to Recgon for verification', 'success');
    await refresh();
  };

  const cancelTask = async (taskId: string) => {
    if (!confirm('Cancel this task? It will be marked as cancelled but kept for history.')) return;
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      addToast(d.error || 'Cancel failed', 'error');
      return;
    }
    addToast('Task cancelled', 'success');
    await refresh();
  };

  const deleteTaskNow = async (taskId: string) => {
    if (!confirm('Delete this task permanently? This cannot be undone.')) return;
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      addToast(d.error || 'Delete failed', 'error');
      return;
    }
    addToast('Task deleted', 'success');
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const isAssigneeOf = (task: AgentTask): boolean => {
    if (!currentUserId || !task.assignedTo) return false;
    const assignee = teammateById(task.assignedTo);
    return assignee?.userId === currentUserId;
  };

  // Decide which big primary action to show on a row, given the user's role
  // and the task state. Returns null when there's nothing actionable.
  const resolvePrimary = (t: AgentTask): {
    label: string;
    tone: 'primary' | 'warn';
    onClick: () => void;
    loading?: boolean;
  } | null => {
    const assigneeOf = isAssigneeOf(t);
    if (assigneeOf && t.verificationStatus === 'proof_requested') {
      return {
        label: proofExpanded[t.id] ? 'Submitting…' : 'Submit proof',
        tone: 'warn',
        onClick: () => setProofExpanded((p) => ({ ...p, [t.id]: !p[t.id] })),
      };
    }
    if (assigneeOf && ['assigned', 'accepted', 'in_progress'].includes(t.status)) {
      return {
        label: 'Mark done',
        tone: 'primary',
        onClick: () => markDone(t.id),
      };
    }
    if (teamRole === 'owner' && t.status === 'awaiting_review') {
      return {
        label: 'Verify & complete',
        tone: 'primary',
        onClick: () => ownerOverride(t.id),
      };
    }
    return null;
  };

  const renderRow = (t: AgentTask, index: number) => {
    const assigned = teammateById(t.assignedTo);
    const closed = (CLOSED_STATUSES as ReadonlyArray<string>).includes(t.status);
    const isWriter = teamRole === 'owner' || teamRole === 'member';
    const canOverride = teamRole === 'owner' && !['completed', 'cancelled', 'declined'].includes(t.status);
    const canCancel = isWriter && !['completed', 'cancelled'].includes(t.status);
    const canDelete = isWriter;
    const assigneeOf = isAssigneeOf(t);
    const showProofForm = assigneeOf && t.verificationStatus === 'proof_requested';
    const cleanTitle = stripMd(t.title);
    const cleanDescription = stripMd(t.description);
    const primary = resolvePrimary(t);
    const pBadge = priorityBadge(t.priority);
    // Reserve the colored accent stripe for rows that need *your* action.
    // Everything else stays neutral so the truly urgent rows pop.
    const attention = isAttentionTask(t);
    const accent = attention
      ? (t.verificationStatus === 'failed' ? '#ef4444' : '#f59e0b')
      : null;

    const accentVar = accent
      ? { ['--rg-accent' as string]: accent, ['--rg-accent-glow' as string]: `0 0 12px ${accent}55` }
      : {};

    return (
      <div
        key={t.id}
        className="glass-card rg-row"
        data-closed={closed ? 'true' : undefined}
        data-attention={attention ? 'true' : undefined}
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

            <div className="rg-row__meta">
              <TaskStatusChip
                status={t.status}
                verification={t.verificationStatus}
                evidence={t.verificationEvidence ?? null}
              />
              {pBadge && (
                <span className="rg-meta-priority" style={{ color: pBadge.color }} title={`Priority ${t.priority}`}>
                  {pBadge.label}
                </span>
              )}
              {t.kind !== 'custom' && (
                <>
                  <span className="rg-meta-kind">{KIND_LABEL[t.kind]}</span>
                  <span className="rg-meta-divider" aria-hidden>·</span>
                </>
              )}
              <span className="rg-meta-assignee">
                <TeammateBubble tm={assigned} />
                <Select
                  value={t.assignedTo ?? ''}
                  onChange={(value) => reassign(t.id, value || null)}
                  placeholder="unassigned"
                  options={[
                    { value: '', label: 'unassigned' },
                    ...teammates.map((tm) => ({ value: tm.id, label: tm.displayName })),
                  ]}
                  size="sm"
                  style={{ minWidth: 140 }}
                />
              </span>
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
                      placeholder="Proof links (Reel URL, blog post, PR — separate with spaces)"
                      value={proofLinks[t.id] ?? ''}
                      onChange={(e) => setProofLinks((p) => ({ ...p, [t.id]: e.target.value }))}
                      className="rg-input rg-input--sm"
                      style={{ marginBottom: 6 }}
                    />
                    <ProofDropZone
                      uploading={proofUploading === t.id}
                      files={proofAttachments[t.id] ?? []}
                      onPick={(files) => uploadProofFiles(t.id, files)}
                      onRemove={(idx) => removeProofAttachment(t.id, idx)}
                    />
                    <p className="rg-proof__footnote">
                      Recgon will fetch any URL you paste and judge the page itself — not just your description.
                    </p>
                    <div className="rg-proof__actions">
                      <button
                        onClick={() => submitProof(t.id)}
                        disabled={proofSubmitting === t.id}
                        className="rg-action"
                        data-tone="warn"
                      >
                        {proofSubmitting === t.id && (
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
                        {proofSubmitting === t.id ? 'Submitting…' : 'Submit proof'}
                      </button>
                      <button
                        onClick={() => setProofExpanded((p) => ({ ...p, [t.id]: false }))}
                        disabled={proofSubmitting === t.id}
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

          <div className="rg-row__actions">
            {primary && (
              <button
                onClick={primary.onClick}
                className="rg-action"
                data-tone={primary.tone}
                disabled={primary.loading}
              >
                {primary.label}
              </button>
            )}

            <div className="rg-row__overflow">
              {canOverride && primary?.label !== 'Verify & complete' && (
                <IconBtn
                  onClick={() => ownerOverride(t.id)}
                  title="Mark done (owner override) — bypass verification"
                  color="#a855f7"
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </IconBtn>
              )}
              {canCancel && (
                <IconBtn
                  onClick={() => cancelTask(t.id)}
                  title="Cancel — kept for history"
                  color="var(--txt-muted)"
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
                  </svg>
                </IconBtn>
              )}
              {canDelete && (
                <IconBtn
                  onClick={() => deleteTaskNow(t.id)}
                  title="Delete permanently"
                  color="#ef4444"
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </IconBtn>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rg-tasks-page" style={{ maxWidth: 1080 }}>
      <nav className="rg-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/teams">Teams</Link>
        <span aria-hidden style={{ opacity: 0.5 }}>/</span>
        <Link href={`/teams/${teamId}`}>{teamName ?? '…'}</Link>
        <span aria-hidden style={{ opacity: 0.5 }}>/</span>
        <span style={{ color: 'var(--txt-pure)' }}>Tasks</span>
      </nav>

      <div
        className="page-header"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div style={{ minWidth: 0 }}>
          <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>tasks</h2>
          {teamName && <p>{teamName}</p>}
        </div>
        {!draftOpen && (
          <button onClick={() => setDraftOpen(true)} className="rg-cta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New task
          </button>
        )}
      </div>

      <div className="rg-filters" role="tablist" aria-label="Filter tasks">
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

      {draftOpen && (
        <div className="glass-card rg-compose">
          <div className="rg-compose__head">
            <div className="rg-compose__stamp">Dispatch · New task</div>
            <button
              onClick={() => setDraftOpen(false)}
              aria-label="Close compose"
              className="rg-compose__close"
            >
              ×
            </button>
          </div>
          <div className="rg-compose__row">
            <input
              placeholder="Task title — what needs to happen?"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus
              className="rg-input"
              style={{ flex: '1 1 280px' }}
            />
            <Select
              value={draft.kind}
              onChange={(value) => setDraft({ ...draft, kind: value as TaskKind })}
              options={(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => ({
                value: k,
                label: KIND_LABEL[k],
              }))}
              size="sm"
              style={{ flex: '0 0 auto', minWidth: 140 }}
            />
            <Select
              value={String(draft.priority)}
              onChange={(value) => setDraft({ ...draft, priority: Number(value) })}
              options={[
                { value: '0', label: 'Urgent — drop everything' },
                { value: '1', label: 'High' },
                { value: '2', label: 'Normal' },
                { value: '3', label: 'Low' },
              ]}
              size="sm"
              style={{ flex: '0 0 auto', minWidth: 180 }}
            />
            <button
              onClick={createTask}
              disabled={!draft.title.trim() || creating}
              className="rg-action"
              data-tone="primary"
            >
              {creating ? '…' : 'Create'}
            </button>
          </div>
          <textarea
            placeholder="Optional description — what does done look like?"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={2}
            className="rg-input"
            style={{ resize: 'vertical' }}
          />
        </div>
      )}

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
            {filter === 'all' && 'No tasks yet.'}
            {filter === 'needs_you' && 'Nothing needs you right now.'}
            {filter === 'done' && 'No completed tasks yet.'}
          </h2>
          <p className="rg-empty__body">
            {filter === 'all' && 'Create one — or let Recgon mint work as your projects evolve.'}
            {filter === 'needs_you' && 'You\'re clear. New work will surface here when Recgon needs you.'}
            {filter === 'done' && 'Verified work will land here as tasks complete.'}
          </p>
          {filter === 'all' ? (
            <button onClick={() => setDraftOpen(true)} className="rg-action" data-tone="primary">
              New task
            </button>
          ) : (
            <button onClick={() => setFilter('all')} className="rg-action" data-tone="ghost">
              Show all tasks
            </button>
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
          {grouped.closed.length > 0 && (
            <details className="rg-closed-section">
              <summary>
                <div className="rg-section-head">
                  <span className="rg-section-head__label">Closed</span>
                  <span className="rg-section-head__count">{grouped.closed.length}</span>
                  <span className="rg-section-head__line" aria-hidden />
                </div>
              </summary>
              <div className="rg-list" style={{ marginTop: 4 }}>
                {grouped.closed.map((t, i) => renderRow(t, i))}
              </div>
            </details>
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

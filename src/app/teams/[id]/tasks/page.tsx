'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/Toast';
import Select from '@/components/Select';
import type {
  AgentTask,
  TeammateWithStats,
  TaskKind,
  TaskStatus,
  VerificationStatus,
} from '@/lib/recgon/types';

const KIND_LABEL: Record<TaskKind, string> = {
  next_step: 'Next step',
  dev_prompt: 'Dev prompt',
  marketing: 'Marketing',
  analytics: 'Analytics',
  research: 'Research',
  custom: 'Task',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  unassigned: '#6b7280',
  assigned: '#3b82f6',
  accepted: '#0ea5e9',
  in_progress: '#0ea5e9',
  awaiting_review: '#f59e0b',
  completed: '#10b981',
  declined: '#ef4444',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  none: '',
  auto_running: 'verifying…',
  auto_passed: 'auto-verified',
  auto_inconclusive: 'inconclusive',
  proof_requested: 'proof requested',
  proof_evaluating: 'evaluating proof…',
  passed: 'verified',
  failed: 'verification failed',
  owner_override: 'owner override',
};

const VERIFICATION_COLOR: Record<VerificationStatus, string> = {
  none: 'transparent',
  auto_running: '#0ea5e9',
  auto_passed: '#10b981',
  auto_inconclusive: '#f59e0b',
  proof_requested: '#f59e0b',
  proof_evaluating: '#0ea5e9',
  passed: '#10b981',
  failed: '#ef4444',
  owner_override: '#a855f7',
};

/**
 * Strip lightweight markdown formatting from LLM-authored task strings so
 * users don't see stray `**`, `__`, `*`, `_`, or backticks rendered as text.
 * We do not render markdown — we just clean it.
 */
function stripMd(input: string | null | undefined): string {
  if (!input) return '';
  return input
    // bold/italic markers (**text**, __text__, *text*, _text_)
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1')
    .replace(/(?<![_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1')
    // inline code (`code`)
    .replace(/`([^`]+)`/g, '$1')
    // any remaining stray ** or __ pairs
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .trim();
}

function IconBtn({
  onClick, title, color, children,
}: {
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
      style={{
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        color: 'var(--txt-muted)',
        border: '1px solid var(--btn-secondary-border)',
        borderRadius: 'var(--r-sm)',
        cursor: 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = color;
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 10%, transparent)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--txt-muted)';
        e.currentTarget.style.borderColor = 'var(--btn-secondary-border)';
        e.currentTarget.style.background = 'transparent';
      }}
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
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [teammates, setTeammates] = useState<TeammateWithStats[]>([]);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', kind: 'custom' as TaskKind });
  const [teamRole, setTeamRole] = useState<'owner' | 'member' | 'viewer' | null>(null);
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({});
  const [proofLinks, setProofLinks] = useState<Record<string, string>>({});
  const [proofExpanded, setProofExpanded] = useState<Record<string, boolean>>({});
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
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { refresh(); }, [refresh]);

  const teammateById = (id: string | null) => teammates.find((t) => t.id === id);
  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

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
      setDraft({ title: '', description: '', kind: 'custom' });
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

  const submitProof = async (taskId: string) => {
    const text = (proofDrafts[taskId] ?? '').trim();
    const linkRaw = (proofLinks[taskId] ?? '').trim();
    const links = linkRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s));
    if (!text && links.length === 0) {
      addToast('Add a proof note or link before submitting', 'error');
      return;
    }
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, links }),
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
    await refresh();
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

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', fontFamily: 'inherit',
    background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.85rem',
    boxSizing: 'border-box',
  };

  const isAssigneeOf = (task: AgentTask): boolean => {
    if (!currentUserId || !task.assignedTo) return false;
    const assignee = teammateById(task.assignedTo);
    return assignee?.userId === currentUserId;
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <Link href={`/teams/${teamId}`} style={{ fontSize: '0.78rem', color: 'var(--txt-muted)', textDecoration: 'none' }}>
        ← Back to team
      </Link>
      <h1 style={{ fontSize: '1.4rem', color: 'var(--txt-pure)', margin: '14px 0 16px' }}>Tasks</h1>

      {/* Quick create */}
      <div className="glass-card" style={{ padding: 14, borderRadius: 12, marginBottom: 16 }}>
        <div className="recgon-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--txt-muted)', marginBottom: 10 }}>
          NEW TASK
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Task title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            style={{ ...inputStyle, flex: '1 1 280px' }}
          />
          <Select
            value={draft.kind}
            onChange={(value) => setDraft({ ...draft, kind: value as TaskKind })}
            options={(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => ({
              value: k,
              label: KIND_LABEL[k],
            }))}
            size="sm"
            style={{ flex: '0 0 auto', minWidth: 130 }}
          />
          <button
            onClick={createTask}
            disabled={!draft.title.trim() || creating}
            style={{
              padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600,
              background: 'var(--signature)', color: 'white', border: 'none',
              borderRadius: 'var(--r-pill)', cursor: creating ? 'wait' : 'pointer',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? '…' : 'Create'}
          </button>
        </div>
        <textarea
          placeholder="Optional description"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          style={{ ...inputStyle, width: '100%', marginTop: 8, resize: 'vertical' }}
        />
      </div>

      {/* Filters */}
      <div
        className="glass-card"
        style={{
          display: 'inline-flex',
          gap: 4,
          marginBottom: 12,
          padding: 4,
          borderRadius: 'var(--r-pill)',
          flexWrap: 'wrap',
        }}
      >
        {(['all', 'unassigned', 'assigned', 'in_progress', 'awaiting_review', 'completed', 'cancelled'] as const).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f as TaskStatus | 'all')}
              style={{
                padding: '4px 12px',
                fontSize: '0.74rem',
                fontWeight: 600,
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                borderRadius: 'var(--r-pill)',
                border: '1px solid transparent',
                background: active ? 'rgba(var(--signature-rgb), 0.12)' : 'transparent',
                color: active ? 'var(--signature)' : 'var(--txt-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {f.replace('_', ' ')}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading && <p style={{ color: 'var(--txt-muted)' }}>Loading…</p>}
      {!loading && filtered.length === 0 && (
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.9rem' }}>No tasks match.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((t) => {
          const assigned = teammateById(t.assignedTo);
          const verifyLabel = VERIFICATION_LABEL[t.verificationStatus];
          const verifyColor = VERIFICATION_COLOR[t.verificationStatus];
          const showProofForm = isAssigneeOf(t) && t.verificationStatus === 'proof_requested';
          const canOverride =
            teamRole === 'owner' &&
            !['completed', 'cancelled', 'declined'].includes(t.status);
          const isWriter = teamRole === 'owner' || teamRole === 'member';
          const canCancel = isWriter && !['completed', 'cancelled'].includes(t.status);
          const canDelete = isWriter;
          return (
            <div key={t.id} className="glass-card" style={{ padding: 12, borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--txt-pure)' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--signature)', marginRight: 8, fontWeight: 700, letterSpacing: '0.08em' }}>
                      {KIND_LABEL[t.kind].toUpperCase()}
                    </span>
                    {stripMd(t.title)}
                  </div>
                  {t.description && stripMd(t.description) && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--txt-muted)', margin: '4px 0 0' }}>
                      {stripMd(t.description)}
                    </p>
                  )}
                  <div style={{ fontSize: '0.72rem', color: 'var(--txt-muted)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: STATUS_COLOR[t.status] }}>● {t.status.replace('_', ' ')}</span>
                    <span>p{t.priority}</span>
                    <span>{t.source}</span>
                    {assigned && <span>assigned to {assigned.displayName}</span>}
                    {verifyLabel && (
                      <span style={{
                        color: verifyColor, border: `1px solid ${verifyColor}`,
                        padding: '1px 6px', borderRadius: 'var(--r-pill)', fontWeight: 600,
                      }}>
                        {verifyLabel}
                      </span>
                    )}
                  </div>
                  {t.verificationEvidence?.verdict && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--txt-muted)', marginTop: 6, fontStyle: 'italic' }}>
                      Recgon: {t.verificationEvidence.verdict}
                    </p>
                  )}

                  {showProofForm && (
                    <div style={{ marginTop: 10, padding: 10, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--txt-muted)', marginBottom: 6 }}>
                        Recgon couldn&apos;t auto-verify this. Submit proof — what you did, links, screenshots.
                      </div>
                      {!proofExpanded[t.id] ? (
                        <button
                          onClick={() => setProofExpanded((p) => ({ ...p, [t.id]: true }))}
                          style={{
                            padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                            background: 'transparent', color: '#f59e0b',
                            border: '1px solid #f59e0b', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                          }}
                        >
                          Submit proof
                        </button>
                      ) : (
                        <>
                          <textarea
                            placeholder="Describe what you did."
                            value={proofDrafts[t.id] ?? ''}
                            onChange={(e) => setProofDrafts((p) => ({ ...p, [t.id]: e.target.value }))}
                            rows={3}
                            style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
                          />
                          <input
                            placeholder="Proof links (Reel URL, blog post, PR, etc — separate with spaces)"
                            value={proofLinks[t.id] ?? ''}
                            onChange={(e) => setProofLinks((p) => ({ ...p, [t.id]: e.target.value }))}
                            style={{ ...inputStyle, width: '100%', marginBottom: 6, fontSize: '0.78rem' }}
                          />
                          <div style={{ fontSize: '0.7rem', color: 'var(--txt-muted)', marginBottom: 6 }}>
                            Recgon will fetch any URL you paste and judge the page itself — not just your description.
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => submitProof(t.id)}
                              style={{
                                padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                                background: '#f59e0b', color: 'white', border: 'none',
                                borderRadius: 'var(--r-pill)', cursor: 'pointer',
                              }}
                            >
                              Submit
                            </button>
                            <button
                              onClick={() => setProofExpanded((p) => ({ ...p, [t.id]: false }))}
                              style={{
                                padding: '4px 10px', fontSize: '0.78rem',
                                background: 'transparent', color: 'var(--txt-muted)',
                                border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, width: 170 }}>
                  <Select
                    value={t.assignedTo ?? ''}
                    onChange={(value) => reassign(t.id, value || null)}
                    placeholder="unassigned"
                    options={[
                      { value: '', label: 'unassigned' },
                      ...teammates.map((tm) => ({ value: tm.id, label: tm.displayName })),
                    ]}
                    size="sm"
                  />
                  {(canOverride || canCancel || canDelete) && (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {canOverride && (
                        <IconBtn
                          onClick={() => ownerOverride(t.id)}
                          title="Mark done (owner override) — bypass verification"
                          color="#a855f7"
                        >
                          {/* check icon */}
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
                          {/* slash-circle icon */}
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
                          {/* trash icon */}
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </IconBtn>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

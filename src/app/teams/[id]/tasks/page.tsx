'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/Toast';
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
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as TaskKind })}
            style={{ ...inputStyle, flex: '0 0 auto' }}
          >
            {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'unassigned', 'assigned', 'in_progress', 'awaiting_review', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as TaskStatus | 'all')}
            style={{
              padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', borderRadius: 'var(--r-pill)',
              border: '1px solid ' + (filter === f ? 'var(--signature)' : 'var(--border)'),
              background: filter === f ? 'rgba(var(--signature-rgb), 0.08)' : 'transparent',
              color: filter === f ? 'var(--signature)' : 'var(--txt-muted)',
            }}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
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
          return (
            <div key={t.id} className="glass-card" style={{ padding: 12, borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--txt-pure)' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--signature)', marginRight: 8, fontWeight: 700, letterSpacing: '0.08em' }}>
                      {KIND_LABEL[t.kind].toUpperCase()}
                    </span>
                    {t.title}
                  </div>
                  {t.description && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--txt-muted)', margin: '4px 0 0' }}>
                      {t.description}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, minWidth: 180 }}>
                  <select
                    value={t.assignedTo ?? ''}
                    onChange={(e) => reassign(t.id, e.target.value || null)}
                    style={{ ...inputStyle, fontSize: '0.78rem', maxWidth: 180 }}
                  >
                    <option value="">— unassign —</option>
                    {teammates.map((tm) => (
                      <option key={tm.id} value={tm.id}>{tm.displayName} ({tm.kind})</option>
                    ))}
                  </select>
                  {canOverride && (
                    <button
                      onClick={() => ownerOverride(t.id)}
                      style={{
                        padding: '4px 10px', fontSize: '0.74rem', fontWeight: 600,
                        background: 'transparent', color: '#a855f7',
                        border: '1px solid #a855f7', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                      }}
                      title="Mark complete and bypass verification"
                    >
                      Mark done (owner)
                    </button>
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

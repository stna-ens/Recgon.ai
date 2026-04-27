'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import type { AgentTask, TeammateWithStats, TaskKind, TaskStatus } from '@/lib/recgon/types';

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

export default function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: teamId } = use(params);
  const { addToast } = useToast();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [teammates, setTeammates] = useState<TeammateWithStats[]>([]);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', kind: 'custom' as TaskKind });

  const refresh = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/teams/${teamId}/tasks`),
      fetch(`/api/teams/${teamId}/teammates`),
    ]);
    if (r1.ok) setTasks((await r1.json()).tasks);
    if (r2.ok) setTeammates((await r2.json()).teammates);
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

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', fontFamily: 'inherit',
    background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.85rem',
    boxSizing: 'border-box',
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
                  <div style={{ fontSize: '0.72rem', color: 'var(--txt-muted)', marginTop: 6 }}>
                    <span style={{ color: STATUS_COLOR[t.status] }}>● {t.status.replace('_', ' ')}</span>
                    {' • '}p{t.priority} • {t.source}
                    {assigned && ` • assigned to ${assigned.displayName}`}
                  </div>
                </div>
                <select
                  value={t.assignedTo ?? ''}
                  onChange={(e) => reassign(t.id, e.target.value || null)}
                  style={{ ...inputStyle, fontSize: '0.78rem', flexShrink: 0, maxWidth: 180 }}
                >
                  <option value="">— unassign —</option>
                  {teammates.map((tm) => (
                    <option key={tm.id} value={tm.id}>{tm.displayName} ({tm.kind})</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

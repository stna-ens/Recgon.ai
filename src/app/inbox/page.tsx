'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

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
};

const STATUS_COLOR: Record<string, string> = {
  assigned: '#3b82f6',
  accepted: '#0ea5e9',
  in_progress: '#0ea5e9',
  awaiting_review: '#f59e0b',
};

const KIND_LABEL: Record<string, string> = {
  next_step: 'Next step',
  dev_prompt: 'Dev prompt',
  marketing: 'Marketing',
  analytics: 'Analytics',
  research: 'Research',
  custom: 'Task',
};

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function InboxPage() {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState<InboxTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/inbox');
    if (res.ok) {
      const { tasks } = await res.json();
      setTasks(tasks);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const act = useCallback(
    async (task: InboxTask, action: 'accept' | 'decline' | 'complete', extra?: Record<string, unknown>) => {
      setWorking(task.id);
      try {
        const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: extra ? JSON.stringify(extra) : '{}',
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `${action} failed`);
        }
        if (action === 'decline') {
          const { reassignedTo } = await res.json();
          addToast(reassignedTo ? 'Declined — Recgon reassigned' : 'Declined — Recgon will reassign', 'success');
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

  const open = tasks.filter((t) => t.status !== 'awaiting_review');
  const review = tasks.filter((t) => t.status === 'awaiting_review');

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: '1.4rem', color: 'var(--txt-pure)', margin: '0 0 4px' }}>Inbox</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--txt-muted)', marginBottom: 18 }}>
        Tasks Recgon assigned to you across your teams. Accept what you'll work on; decline what isn't a fit and Recgon will reassign.
      </p>

      {loading && <p style={{ color: 'var(--txt-muted)' }}>Loading…</p>}
      {!loading && tasks.length === 0 && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 12, textAlign: 'center', color: 'var(--txt-muted)' }}>
          Nothing in your inbox right now.
        </div>
      )}

      {open.length > 0 && (
        <>
          <div className="recgon-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--txt-muted)', margin: '12px 0 8px' }}>
            OPEN · {open.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {open.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                busy={working === t.id}
                onAccept={() => act(t, 'accept')}
                onDecline={() => {
                  const note = window.prompt('Why are you declining? (optional)') ?? undefined;
                  act(t, 'decline', { note });
                }}
                onComplete={() => {
                  const summary = window.prompt('Quick note about what you did (optional)') ?? undefined;
                  act(t, 'complete', { summary });
                }}
              />
            ))}
          </div>
        </>
      )}

      {review.length > 0 && (
        <>
          <div className="recgon-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--txt-muted)', margin: '12px 0 8px' }}>
            AWAITING REVIEW · {review.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {review.map((t) => (
              <TaskCard key={t.id} task={t} busy={false} onAccept={() => {}} onDecline={() => {}} onComplete={() => {}} review />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TaskCard({
  task,
  busy,
  onAccept,
  onDecline,
  onComplete,
  review,
}: {
  task: InboxTask;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onComplete: () => void;
  review?: boolean;
}) {
  const summary =
    task.result && typeof (task.result as { summary?: string }).summary === 'string'
      ? (task.result as { summary: string }).summary
      : null;

  return (
    <div className="glass-card" style={{ padding: 14, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--signature)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>
            {KIND_LABEL[task.kind] ?? task.kind} · {task.teamName}
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--txt-pure)' }}>{task.title}</div>
          {task.description && (
            <p style={{ fontSize: '0.85rem', color: 'var(--txt-muted)', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
              {task.description}
            </p>
          )}
          {summary && (
            <p style={{ fontSize: '0.82rem', color: 'var(--txt-muted)', margin: '8px 0 0', fontStyle: 'italic' }}>
              {summary}
            </p>
          )}
          <div style={{ fontSize: '0.72rem', color: 'var(--txt-muted)', marginTop: 8 }}>
            <span style={{ color: STATUS_COLOR[task.status] }}>● {task.status.replace('_', ' ')}</span>
            {' • '}p{task.priority} • assigned {relTime(task.assigned_at)}
            <Link
              href={`/teams/${task.team_id}/tasks`}
              style={{ marginLeft: 8, color: 'var(--txt-muted)', textDecoration: 'underline' }}
            >
              open in team
            </Link>
          </div>
        </div>

        {!review && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {task.status === 'assigned' && (
              <>
                <button
                  onClick={onAccept}
                  disabled={busy}
                  style={primaryBtn(busy)}
                >
                  Accept
                </button>
                <button onClick={onDecline} disabled={busy} style={ghostBtn(busy)}>
                  Decline
                </button>
              </>
            )}
            {(task.status === 'accepted' || task.status === 'in_progress') && (
              <>
                <button onClick={onComplete} disabled={busy} style={primaryBtn(busy)}>
                  Mark done
                </button>
                <button onClick={onDecline} disabled={busy} style={ghostBtn(busy)}>
                  Hand back
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: '0.78rem',
    fontWeight: 600,
    background: 'var(--signature)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--r-pill)',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
    whiteSpace: 'nowrap',
  };
}

function ghostBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: '0.78rem',
    fontWeight: 600,
    background: 'transparent',
    color: 'var(--txt-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-pill)',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
    whiteSpace: 'nowrap',
  };
}

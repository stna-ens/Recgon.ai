'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Button, EmptyState, Skeleton, ActionIcon } from '@/components/ui';
import { TaskStatusChip, type WorkflowStatus } from '@/components/TaskStatusChip';
import { NewIssueModal, type CreatedIssue } from './NewIssueModal';

type IssueStatus = 'open' | 'converting' | 'converted' | 'closed';

interface Issue {
  id: string;
  teamId: string;
  title: string;
  description: string;
  status: IssueStatus;
  taskCount: number;
  createdBy: string | null;
  createdAt: string;
  convertedAt: string | null;
}

interface LinkedTask {
  id: string;
  title: string;
  status: WorkflowStatus;
  assignedTo: string | null;
  verificationStatus?: WorkflowStatus | string;
}

interface Teammate {
  id: string;
  displayName: string;
}

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error('load failed');
  return r.json();
});

// Status pill color — encodes the issue lifecycle on the signature palette.
const STATUS_TONE: Record<IssueStatus, { label: string; color: string }> = {
  open:       { label: 'open',       color: 'var(--txt-faint)' },
  converting: { label: 'converting', color: 'var(--signature)' },
  converted:  { label: 'converted',  color: 'var(--success)' },
  closed:     { label: 'closed',     color: 'var(--txt-muted)' },
};

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function IssuesPage() {
  const { currentTeam } = useTeam();
  const { addToast } = useToast();
  const teamId = currentTeam?.id ?? null;
  const [showNew, setShowNew] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{ issues: Issue[] }>(
    teamId ? `/api/teams/${teamId}/issues` : null,
    fetcher,
  );
  const { data: teammateData } = useSWR<{ teammates: Teammate[] }>(
    teamId ? `/api/teams/${teamId}/teammates` : null,
    fetcher,
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (teammateData?.teammates ?? []).forEach((tm) => m.set(tm.id, tm.displayName));
    return m;
  }, [teammateData]);

  const issues = data?.issues ?? [];

  const onCreated = (result: CreatedIssue) => {
    void mutate();
    const n = result.taskCount;
    if (n > 0) {
      addToast(`Recgon split this into ${n} task${n === 1 ? '' : 's'}.`, 'success');
    } else {
      addToast('Issue filed — conversion will retry shortly.', 'info');
    }
  };

  return (
    <div className="issues-page">
      <header className="issues-head">
        <div>
          <div className="recgon-label">Issues</div>
          <h1 className="issues-title">Tell Recgon what needs doing</h1>
          <p className="issues-sub">
            File an issue and Recgon breaks it into the right tasks, then routes each to the best-fit teammate.
          </p>
        </div>
        {teamId && (
          <Button variant="primary" icon={ActionIcon.create} onClick={() => setShowNew(true)}>
            New issue
          </Button>
        )}
      </header>

      {!teamId ? (
        <EmptyState title="Pick a team" description="Select a team to see its issues." />
      ) : isLoading ? (
        <div className="issues-list">
          <Skeleton style={{ height: 64 }} />
          <Skeleton style={{ height: 64 }} />
          <Skeleton style={{ height: 64 }} />
        </div>
      ) : error ? (
        <EmptyState
          title="Could not load issues"
          description="Something went wrong. Try again."
          action={<Button onClick={() => void mutate()} icon={ActionIcon.refresh}>Retry</Button>}
        />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>⟨⟩</span>}
          title="No issues yet"
          description="File the first issue and watch Recgon turn it into assigned tasks."
          action={<Button variant="primary" icon={ActionIcon.create} onClick={() => setShowNew(true)}>New issue</Button>}
        />
      ) : (
        <div className="issues-list">
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} teamId={teamId} nameById={nameById} />
          ))}
        </div>
      )}

      {teamId && (
        <NewIssueModal open={showNew} onOpenChange={setShowNew} teamId={teamId} onCreated={onCreated} />
      )}

      <style>{`
        .issues-page { max-width: 920px; margin: 0 auto; padding: 8px 0 64px; }
        .issues-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 20px; margin-bottom: 24px;
        }
        .issues-title {
          font-size: 22px; font-weight: 700; letter-spacing: -0.01em;
          color: var(--txt-pure); margin: 6px 0 4px;
        }
        .issues-sub { font-size: 13px; color: var(--txt-muted); max-width: 540px; line-height: 1.5; }
        .issues-list { display: flex; flex-direction: column; gap: 10px; }
      `}</style>
    </div>
  );
}

function IssueRow({
  issue,
  teamId,
  nameById,
}: {
  issue: Issue;
  teamId: string;
  nameById: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = STATUS_TONE[issue.status];

  // Lazy-load the linked tasks only once the row is expanded.
  const { data, isLoading } = useSWR<{ tasks: LinkedTask[] }>(
    expanded ? `/api/teams/${teamId}/issues/${issue.id}` : null,
    fetcher,
  );
  const tasks = data?.tasks ?? [];

  return (
    <div className="glass-card issue-row">
      <button
        type="button"
        className="issue-row-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`issue-chevron ${expanded ? 'is-open' : ''}`} aria-hidden="true">›</span>
        <span className="issue-main">
          <span className="issue-row-title">{issue.title}</span>
          {issue.description && <span className="issue-row-desc">{issue.description}</span>}
        </span>
        <span className="issue-meta">
          <span className="recgon-label issue-status" style={{ color: tone.color, borderColor: tone.color }}>
            {tone.label}
          </span>
          <span className="issue-count">{issue.taskCount} task{issue.taskCount === 1 ? '' : 's'}</span>
          <span className="issue-date">{relDate(issue.createdAt)}</span>
        </span>
      </button>

      {expanded && (
        <div className="issue-tasks">
          {isLoading ? (
            <Skeleton style={{ height: 28 }} />
          ) : tasks.length === 0 ? (
            <p className="issue-tasks-empty">No tasks linked to this issue yet.</p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="issue-task-row">
                <span className="issue-task-title">{task.title}</span>
                <span className="issue-task-right">
                  <span className="issue-task-assignee">
                    {task.assignedTo ? (nameById.get(task.assignedTo) ?? 'assigned') : 'unassigned'}
                  </span>
                  <TaskStatusChip
                    status={task.status}
                    verification={task.verificationStatus as never}
                  />
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        .issue-row { padding: 0; overflow: hidden; }
        .issue-row-head {
          width: 100%; display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; background: transparent; border: none; cursor: pointer;
          text-align: left; color: inherit;
          transition: background var(--dur-base) ease;
        }
        .issue-row-head:hover { background: rgba(var(--signature-rgb), 0.04); }
        .issue-chevron {
          font-size: 16px; color: var(--txt-faint); line-height: 1;
          transition: transform var(--dur-base) ease, color var(--dur-base) ease;
        }
        .issue-chevron.is-open { transform: rotate(90deg); color: var(--signature); }
        .issue-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .issue-row-title {
          font-size: 14px; font-weight: 600; color: var(--txt-pure);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .issue-row-desc {
          font-size: 12px; color: var(--txt-faint);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .issue-meta { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
        .issue-status {
          padding: 2px 8px; border: 1px solid; border-radius: 999px;
          font-size: 10px; background: transparent;
        }
        .issue-count, .issue-date {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; color: var(--txt-faint); white-space: nowrap;
        }
        .issue-tasks {
          display: flex; flex-direction: column; gap: 6px;
          padding: 4px 16px 14px 40px;
          border-top: 1px solid var(--rule, rgba(255,255,255,0.06));
        }
        .issue-tasks-empty { font-size: 12px; color: var(--txt-faint); padding: 8px 0; }
        .issue-task-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 6px 0;
        }
        .issue-task-title {
          font-size: 13px; color: var(--txt-muted); min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .issue-task-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .issue-task-assignee {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; color: var(--txt-faint);
        }
        @media (max-width: 640px) {
          .issue-row-desc { display: none; }
          .issue-count { display: none; }
        }
      `}</style>
    </div>
  );
}

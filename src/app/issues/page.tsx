'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import useSWR from 'swr';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Button, EmptyState, Skeleton } from '@/components/ui';
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

// Status → rail/dot color + a tone keyword. The rail encodes lifecycle without
// words; `live` drives the converting pulse (Recgon is actively splitting).
const STATUS_TONE: Record<IssueStatus, { label: string; color: string; live?: boolean }> = {
  open:       { label: 'open',       color: 'var(--txt-faint)' },
  converting: { label: 'splitting',  color: 'var(--signature)', live: true },
  converted:  { label: 'converted',  color: 'var(--success)' },
  closed:     { label: 'closed',     color: 'var(--txt-muted)' },
};

type Filter = 'all' | 'open' | 'converted' | 'closed';

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export default function IssuesPage() {
  const { currentTeam } = useTeam();
  const { addToast } = useToast();
  const teamId = currentTeam?.id ?? null;
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

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

  const issues = useMemo(() => data?.issues ?? [], [data]);

  // The split-intelligence readout — the number that makes Recgon's issue panel
  // different from a tracker: how many tasks N issues fanned out into.
  const stats = useMemo(() => {
    let open = 0, converted = 0, closed = 0, tasks = 0;
    for (const i of issues) {
      tasks += i.taskCount || 0;
      if (i.status === 'open' || i.status === 'converting') open++;
      else if (i.status === 'converted') converted++;
      else if (i.status === 'closed') closed++;
    }
    const ratio = converted > 0 ? tasks / converted : 0;
    return { open, converted, closed, tasks, ratio };
  }, [issues]);

  const visible = useMemo(() => {
    if (filter === 'all') return issues;
    if (filter === 'open') return issues.filter((i) => i.status === 'open' || i.status === 'converting');
    return issues.filter((i) => i.status === filter);
  }, [issues, filter]);

  const onCreated = (result: CreatedIssue) => {
    void mutate();
    const n = result.taskCount;
    if (n > 0) {
      addToast(`Recgon split this into ${n} task${n === 1 ? '' : 's'}.`, 'success');
    } else {
      addToast('Issue filed — conversion will retry shortly.', 'info');
    }
  };

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'all', n: issues.length },
    { key: 'open', label: 'open', n: stats.open },
    { key: 'converted', label: 'converted', n: stats.converted },
    { key: 'closed', label: 'closed', n: stats.closed },
  ];

  return (
    <div className="ic">
      <header className="ic-head">
        <div className="ic-head-left">
          <div className="recgon-label">Issue Intake</div>
          <h1 className="ic-title">Tell Recgon what needs doing</h1>
          <p className="ic-sub">
            File an issue. Recgon breaks it into the right tasks and routes each to the best-fit teammate.
          </p>
        </div>
        {teamId && (
          <Button variant="primary" onClick={() => setShowNew(true)}>
            New issue
          </Button>
        )}
      </header>

      {teamId && !error && (
        <div className="ic-readout glass-card">
          <Stat value={String(stats.open)} label="open" />
          <span className="ic-readout-arrow" aria-hidden="true">→</span>
          <Stat value={String(stats.tasks)} label="tasks minted" sig />
          <span className="ic-readout-div" aria-hidden="true" />
          <Stat
            value={stats.ratio > 0 ? stats.ratio.toFixed(1) : '—'}
            label="avg tasks / issue"
          />
        </div>
      )}

      {teamId && !error && issues.length > 0 && (
        <div className="ic-filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={`ic-filter ${filter === f.key ? 'is-active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="ic-filter-n">{f.n}</span>
            </button>
          ))}
        </div>
      )}

      {!teamId ? (
        <EmptyState title="Pick a team" description="Select a team to see its issues." />
      ) : isLoading ? (
        <div className="ic-list">
          <Skeleton style={{ height: 56, borderRadius: 14 }} />
          <Skeleton style={{ height: 56, borderRadius: 14 }} />
          <Skeleton style={{ height: 56, borderRadius: 14 }} />
        </div>
      ) : error ? (
        <EmptyState
          title="Could not load issues"
          description="Something went wrong. Try again."
          action={<Button onClick={() => void mutate()}>Retry</Button>}
        />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={<span className="ic-empty-glyph">⟨⟩</span>}
          title="No issues yet"
          description="File the first issue and watch Recgon fan it out into assigned tasks."
          action={<Button variant="primary" onClick={() => setShowNew(true)}>New issue</Button>}
        />
      ) : visible.length === 0 ? (
        <p className="ic-none">No {filter} issues.</p>
      ) : (
        <div className="ic-list">
          {visible.map((issue) => (
            <IssueRow key={issue.id} issue={issue} teamId={teamId} nameById={nameById} />
          ))}
        </div>
      )}

      {teamId && (
        <NewIssueModal open={showNew} onOpenChange={setShowNew} teamId={teamId} onCreated={onCreated} />
      )}

      <style>{`
        .ic { max-width: 960px; margin: 0 auto; padding: 8px 0 72px; }
        .ic-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 20px; margin-bottom: 20px;
        }
        .ic-title {
          font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
          color: var(--txt-pure); margin: 8px 0 6px; line-height: 1.15;
        }
        .ic-sub { font-size: 13px; color: var(--txt-muted); max-width: 520px; line-height: 1.5; }

        /* ── HUD readout: the split-intelligence numbers ───────────────── */
        .ic-readout {
          display: flex; align-items: center; gap: 22px;
          padding: 16px 22px !important; border-radius: var(--r-sm) !important;
          margin-bottom: 22px;
        }
        .ic-readout-arrow {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 16px; color: rgba(var(--signature-rgb), 0.55); margin: 0 -6px;
        }
        .ic-readout-div { width: 1px; height: 30px; background: var(--rule); margin-left: auto; }
        .ic-stat { display: flex; flex-direction: column; gap: 2px; }
        .ic-stat-v {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 24px; font-weight: 700; line-height: 1; color: var(--txt-pure);
          letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
        }
        .ic-stat-v.sig { color: var(--signature); }
        .ic-stat-l {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 600; letter-spacing: 0.6px;
          text-transform: uppercase; color: var(--txt-faint);
        }

        /* ── Segmented filter ──────────────────────────────────────────── */
        .ic-filters { display: flex; gap: 4px; margin-bottom: 14px; }
        .ic-filter {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase;
          color: var(--txt-muted); background: transparent;
          border: none; border-bottom: 1.5px solid transparent;
          padding: 5px 10px 7px; cursor: pointer;
          transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
        }
        .ic-filter:hover { color: var(--txt-pure); }
        .ic-filter.is-active { color: var(--signature); border-bottom-color: var(--signature); }
        .ic-filter-n {
          font-size: 10px; color: var(--txt-faint);
          background: rgba(var(--signature-rgb), 0.10); border-radius: 999px;
          padding: 1px 6px; min-width: 18px; text-align: center;
        }
        .ic-filter.is-active .ic-filter-n { color: var(--signature); }

        .ic-list { display: flex; flex-direction: column; gap: 8px; }
        .ic-none, .ic-empty-glyph {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .ic-none { font-size: 12px; color: var(--txt-faint); padding: 24px 4px; text-align: center; }
        .ic-empty-glyph { font-size: 22px; color: var(--signature); }
      `}</style>
    </div>
  );
}

function Stat({ value, label, sig }: { value: string; label: string; sig?: boolean }) {
  return (
    <div className="ic-stat">
      <span className={`ic-stat-v ${sig ? 'sig' : ''}`}>{value}</span>
      <span className="ic-stat-l">{label}</span>
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

  // Lazy-load linked tasks only once the row is expanded.
  const { data, isLoading } = useSWR<{ tasks: LinkedTask[] }>(
    expanded ? `/api/teams/${teamId}/issues/${issue.id}` : null,
    fetcher,
  );
  const tasks = data?.tasks ?? [];
  const hasTasks = issue.taskCount > 0;

  return (
    <article className="icr" data-status={issue.status} style={{ '--rail': tone.color } as CSSProperties}>
      <button
        type="button"
        className="icr-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="icr-rail" aria-hidden="true">
          <span className={`icr-dot ${tone.live ? 'is-live' : ''}`} />
        </span>

        <span className="icr-body">
          <span className="icr-title">{issue.title}</span>
          {issue.description && <span className="icr-desc">{issue.description}</span>}
        </span>

        <span className="icr-meta">
          {issue.status === 'converting' ? (
            <span className="icr-fan is-live">splitting…</span>
          ) : hasTasks ? (
            <span className="icr-fan">
              <span className="icr-fan-arrow" aria-hidden="true">→</span>
              {issue.taskCount} task{issue.taskCount === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="icr-fan is-empty">no tasks</span>
          )}
          <span className="icr-status" style={{ color: tone.color }}>{tone.label}</span>
          <span className="icr-date">{relDate(issue.createdAt)}</span>
          <span className={`icr-chevron ${expanded ? 'is-open' : ''}`} aria-hidden="true">›</span>
        </span>
      </button>

      {expanded && (
        <div className="icr-fanout">
          <div className="recgon-label icr-fanout-label">
            {hasTasks ? `Recgon split this into ${issue.taskCount} task${issue.taskCount === 1 ? '' : 's'}` : 'Awaiting breakdown'}
          </div>
          {isLoading ? (
            <Skeleton style={{ height: 30, marginLeft: 27 }} />
          ) : tasks.length === 0 ? (
            <p className="icr-fanout-empty">No tasks linked yet — conversion will retry.</p>
          ) : (
            <div className="icr-tree">
              {tasks.map((task) => (
                <div key={task.id} className="icr-leaf">
                  <span className="icr-leaf-title">{task.title}</span>
                  <span className="icr-leaf-right">
                    <span className="icr-leaf-who">
                      {task.assignedTo ? (nameById.get(task.assignedTo) ?? 'assigned') : 'unassigned'}
                    </span>
                    <TaskStatusChip status={task.status} verification={task.verificationStatus as never} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .icr {
          position: relative; border-radius: var(--r-sm);
          background: var(--bg-content);
          border: 1px solid var(--rule);
          overflow: hidden;
          transition: border-color var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
        }
        .icr:hover { border-color: rgba(var(--signature-rgb), 0.30); transform: translateX(2px); }

        .icr-head {
          width: 100%; display: flex; align-items: stretch; gap: 0;
          background: transparent; border: none; cursor: pointer;
          text-align: left; color: inherit; padding: 0;
        }

        /* status rail + pulse dot */
        .icr-rail {
          flex-shrink: 0; width: 3px; align-self: stretch; margin: 10px 0;
          border-radius: 2px; background: var(--rail);
          position: relative; display: flex; justify-content: center;
        }
        .icr-dot {
          position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
          width: 6px; height: 6px; border-radius: 50%; background: var(--rail);
        }
        .icr-dot.is-live { animation: icrPulse 1.1s var(--ease-out) infinite; }
        @keyframes icrPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(var(--signature-rgb), 0.5); }
          50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0); }
        }

        .icr-body {
          display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;
          padding: 12px 14px;
        }
        .icr-title {
          font-size: 13px; font-weight: 600; letter-spacing: -0.005em; color: var(--txt-pure);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: color var(--dur-fast) var(--ease-out);
        }
        .icr-head:hover .icr-title { color: var(--signature); }
        .icr-desc {
          font-size: 12px; color: var(--txt-faint); line-height: 1.4;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .icr-meta { display: flex; align-items: center; gap: 14px; flex-shrink: 0; padding: 0 14px 0 4px; }
        .icr-fan {
          display: inline-flex; align-items: center; gap: 5px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; font-weight: 600; color: var(--signature);
          background: rgba(var(--signature-rgb), 0.09);
          border: 1px solid rgba(var(--signature-rgb), 0.18);
          border-radius: 999px; padding: 2px 9px; white-space: nowrap;
        }
        .icr-fan-arrow { font-weight: 700; opacity: 0.8; }
        .icr-fan.is-empty {
          color: var(--txt-faint); background: transparent; border-color: var(--rule);
        }
        .icr-fan.is-live { color: var(--signature); animation: icrShimmer 1.4s ease-in-out infinite; }
        @keyframes icrShimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        .icr-status {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
        }
        .icr-date {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; color: var(--txt-faint); white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .icr-chevron {
          font-size: 16px; color: var(--txt-faint); line-height: 1;
          transition: transform var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
        }
        .icr-chevron.is-open { transform: rotate(90deg); color: var(--signature); }

        /* ── fan-out branch tree ───────────────────────────────────────── */
        .icr-fanout { padding: 4px 16px 14px; border-top: 1px solid var(--rule); }
        .icr-fanout-label { margin: 12px 0 8px 27px; }
        .icr-fanout-empty { font-size: 12px; color: var(--txt-faint); margin-left: 27px; padding: 4px 0; }
        .icr-tree { margin-left: 27px; border-left: 1.5px solid rgba(var(--signature-rgb), 0.22); }
        .icr-leaf {
          position: relative; display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 8px 0 8px 20px;
        }
        .icr-leaf::before {
          content: ''; position: absolute; left: 0; top: 50%;
          width: 15px; height: 1.5px; background: rgba(var(--signature-rgb), 0.22);
        }
        .icr-leaf-title {
          font-size: 13px; color: var(--txt-muted); min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .icr-leaf-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .icr-leaf-who {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; color: var(--txt-faint);
        }

        @media (max-width: 640px) {
          .icr-desc { display: none; }
          .icr-fan { display: none; }
          .ic-readout { gap: 14px; padding: 14px 16px !important; }
          .ic-readout-div { display: none; }
        }
      `}</style>
    </article>
  );
}

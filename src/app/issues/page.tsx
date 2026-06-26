'use client';

import { useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';
import * as Dialog from '@radix-ui/react-dialog';
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

type ColKey = 'open' | 'converted' | 'closed';

const COLUMNS: { key: ColKey; tone: string; statuses: IssueStatus[] }[] = [
  { key: 'open',      tone: 'var(--txt-muted)', statuses: ['open', 'converting'] },
  { key: 'converted', tone: 'var(--success)',   statuses: ['converted'] },
  { key: 'closed',    tone: 'var(--txt-faint)',  statuses: ['closed'] },
];
const COL_LABEL: Record<ColKey, string> = { open: 'open', converted: 'converted', closed: 'closed' };

function columnFor(s: IssueStatus): ColKey {
  for (const c of COLUMNS) if (c.statuses.includes(s)) return c.key;
  return 'open';
}

// Supported drag transitions: anything → closed = archive; closed → open = reopen.
// open↔converted is Recgon-driven (the breakdown), never a manual drag.
function validDrop(from: ColKey, to: ColKey): 'closed' | 'open' | null {
  if (from === to) return null;
  if (to === 'closed') return 'closed';
  if (from === 'closed' && to === 'open') return 'open';
  return null;
}

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<ColKey | null>(null);
  // Optimistic status overrides so a dropped card moves instantly.
  const [optimistic, setOptimistic] = useState<Record<string, IssueStatus>>({});

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

  const grouped = useMemo(() => {
    const out: Record<ColKey, Issue[]> = { open: [], converted: [], closed: [] };
    for (const i of issues) {
      const status = optimistic[i.id] ?? i.status;
      out[columnFor(status)].push({ ...i, status });
    }
    return out;
  }, [issues, optimistic]);

  const onCreated = (result: CreatedIssue) => {
    void mutate();
    const n = result.taskCount;
    if (n > 0) addToast(`Recgon split this into ${n} task${n === 1 ? '' : 's'}.`, 'success');
    else addToast('Issue filed — conversion will retry shortly.', 'info');
  };

  const handleDrop = useCallback(async (issue: Issue, target: ColKey) => {
    const from = columnFor(issue.status);
    const action = validDrop(from, target);
    if (!action || !teamId) return;
    setOptimistic((m) => ({ ...m, [issue.id]: action }));
    try {
      const res = await fetch(`/api/teams/${teamId}/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error('patch failed');
      await mutate();
      addToast(action === 'closed' ? 'Issue closed.' : 'Issue reopened.', 'success');
    } catch {
      addToast('Could not update the issue.', 'error');
    } finally {
      setOptimistic((m) => { const n = { ...m }; delete n[issue.id]; return n; });
    }
  }, [teamId, mutate, addToast]);

  return (
    <div className="issb">
      <header className="issb-head">
        <div>
          <div className="recgon-label">Issue Intake</div>
          <h1 className="issb-title">Tell Recgon what needs doing</h1>
          <p className="issb-sub">
            File an issue. Recgon breaks it into the right tasks and routes each to the best-fit teammate.
          </p>
        </div>
        {teamId && (
          <Button variant="primary" onClick={() => setShowNew(true)}>New issue</Button>
        )}
      </header>

      {!teamId ? (
        <EmptyState title="Pick a team" description="Select a team to see its issues." />
      ) : error ? (
        <EmptyState
          title="Could not load issues"
          description="Something went wrong. Try again."
          action={<Button onClick={() => void mutate()}>Retry</Button>}
        />
      ) : isLoading ? (
        <div className="issb-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="issb-col" data-col={col.key}>
              <div className="issb-col-head">
                <span className="issb-col-dot" style={{ background: col.tone }} aria-hidden="true" />
                <span className="issb-col-label" style={{ color: col.tone }}>{COL_LABEL[col.key]}</span>
              </div>
              <div className="issb-col-body">
                <Skeleton style={{ height: 78, borderRadius: 14 }} />
                <Skeleton style={{ height: 78, borderRadius: 14 }} />
              </div>
            </div>
          ))}
        </div>
      ) : issues.length === 0 ? (
        <EmptyState
          icon={<span className="issb-empty-glyph">⟨⟩</span>}
          title="No issues yet"
          description="File the first issue and watch Recgon fan it out into assigned tasks."
          action={<Button variant="primary" onClick={() => setShowNew(true)}>New issue</Button>}
        />
      ) : (
        <div className="issb-board">
          {COLUMNS.map((col) => {
            const items = grouped[col.key];
            const isHover = hoverCol === col.key;
            return (
              <div
                key={col.key}
                data-col={col.key}
                className={`issb-col ${isHover ? 'is-droptarget' : ''}`}
                onDragOver={(e) => {
                  if (!draggedId) return;
                  const dragged = issues.find((i) => i.id === draggedId);
                  if (!dragged) return;
                  const from = columnFor(optimistic[dragged.id] ?? dragged.status);
                  if (validDrop(from, col.key)) { e.preventDefault(); setHoverCol(col.key); }
                }}
                onDragLeave={() => { if (hoverCol === col.key) setHoverCol(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setHoverCol(null);
                  if (!draggedId) return;
                  const dragged = issues.find((i) => i.id === draggedId);
                  setDraggedId(null);
                  if (dragged) void handleDrop({ ...dragged, status: optimistic[dragged.id] ?? dragged.status }, col.key);
                }}
              >
                <div className="issb-col-head">
                  <span className="issb-col-dot" style={{ background: col.tone }} aria-hidden="true" />
                  <span className="issb-col-label" style={{ color: col.tone }}>{COL_LABEL[col.key]}</span>
                  <span className="issb-col-count">{items.length}</span>
                </div>
                <div className="issb-col-body">
                  {items.length === 0 ? (
                    <div className="issb-col-empty">
                      {col.key === 'open' ? 'no open issues' : col.key === 'converted' ? 'nothing converted yet' : 'nothing closed'}
                    </div>
                  ) : (
                    items.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        dragging={draggedId === issue.id}
                        onDragStart={(e) => {
                          setDraggedId(issue.id);
                          e.dataTransfer.effectAllowed = 'move';
                          try { e.dataTransfer.setData('text/plain', issue.id); } catch { /* swallowed */ }
                        }}
                        onDragEnd={() => { setDraggedId(null); setHoverCol(null); }}
                        onClick={() => setDetailId(issue.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {teamId && (
        <NewIssueModal open={showNew} onOpenChange={setShowNew} teamId={teamId} onCreated={onCreated} />
      )}

      {teamId && detailId && (
        <IssueDetail
          teamId={teamId}
          issueId={detailId}
          nameById={nameById}
          onClose={() => setDetailId(null)}
        />
      )}

      <style>{`
        .issb { max-width: 1180px; margin: 0 auto; padding: 8px 0 48px; }
        .issb-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 20px; margin-bottom: 22px;
        }
        .issb-title {
          font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
          color: var(--txt-pure); margin: 8px 0 6px; line-height: 1.15;
        }
        .issb-sub { font-size: 13px; color: var(--txt-muted); max-width: 520px; line-height: 1.5; }
        .issb-empty-glyph { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 22px; color: var(--signature); }

        /* ── Board (mirrors the tasks kanban) ──────────────────────────── */
        .issb-board {
          position: relative; display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px; isolation: isolate;
        }
        .issb-col {
          position: relative; z-index: 1;
          background:
            rgba(20, 20, 24, 0.42) padding-box,
            linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.10) 100%) border-box;
          backdrop-filter: blur(60px) saturate(220%);
          -webkit-backdrop-filter: blur(60px) saturate(220%);
          border: 1px solid transparent; border-radius: 14px;
          box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
          display: flex; flex-direction: column; min-height: 340px; overflow: hidden;
          transition: box-shadow 280ms var(--ease-out), transform 280ms var(--ease-out);
          opacity: 0; transform: translateY(8px);
          animation: issbColIn 520ms var(--ease-out) forwards;
        }
        .issb-board > .issb-col:nth-child(1) { animation-delay: 40ms; }
        .issb-board > .issb-col:nth-child(2) { animation-delay: 110ms; }
        .issb-board > .issb-col:nth-child(3) { animation-delay: 180ms; }
        @keyframes issbColIn { to { opacity: 1; transform: none; } }

        .issb-col[data-col="open"]      { --glow-rgb: 220, 225, 240;      --glow-alpha: 0.16; }
        .issb-col[data-col="converted"] { --glow-rgb: var(--success-rgb); --glow-alpha: 0.42; }
        .issb-col[data-col="closed"]    { --glow-rgb: 220, 225, 240;      --glow-alpha: 0.05; }
        .issb-col::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(circle 70px at 22px 22px,
              rgba(var(--glow-rgb,255,255,255), calc(var(--glow-alpha,0) * 1.0)) 0%,
              rgba(var(--glow-rgb,255,255,255), calc(var(--glow-alpha,0) * 0.55)) 35%,
              rgba(var(--glow-rgb,255,255,255), calc(var(--glow-alpha,0) * 0.15)) 70%,
              rgba(var(--glow-rgb,255,255,255), 0) 100%),
            radial-gradient(circle 360px at 22px 22px,
              rgba(var(--glow-rgb,255,255,255), calc(var(--glow-alpha,0) * 0.28)) 0%,
              rgba(var(--glow-rgb,255,255,255), calc(var(--glow-alpha,0) * 0.10)) 40%,
              rgba(var(--glow-rgb,255,255,255), 0) 80%),
            linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 25%);
          animation: issbTonePulse 3.6s ease-in-out infinite;
        }
        @keyframes issbTonePulse { 0%,100% { opacity: 0.78; } 50% { opacity: 1; } }
        .issb-col-head, .issb-col-body { position: relative; z-index: 1; }

        .issb-col.is-droptarget {
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.55),
            0 0 36px 4px rgba(var(--signature-rgb), 0.22), var(--shadow-float);
          transform: translateY(-1px);
        }
        .issb-col.is-droptarget::after {
          content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(120% 80% at 50% 0%, rgba(var(--signature-rgb), 0.10), transparent 60%);
          animation: issbDropPulse 1.4s ease-in-out infinite;
        }
        @keyframes issbDropPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }

        .issb-col-head {
          display: flex; align-items: center; gap: 8px; padding: 14px 16px 12px;
          border-bottom: 1px solid var(--rule);
          background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%);
        }
        .issb-col-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; color: inherit;
          animation: issbDotPulse 3.6s ease-in-out infinite;
        }
        .issb-col[data-col="open"] .issb-col-dot      { color: var(--txt-muted); }
        .issb-col[data-col="converted"] .issb-col-dot { color: var(--success); }
        .issb-col[data-col="closed"] .issb-col-dot    { color: var(--txt-faint); }
        @keyframes issbDotPulse {
          0%,100% { box-shadow: 0 0 5px currentColor; transform: scale(1); opacity: 0.85; }
          50% { box-shadow: 0 0 12px currentColor, 0 0 22px currentColor; transform: scale(1.08); opacity: 1; }
        }
        .issb-col-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase;
        }
        .issb-col-count {
          margin-left: auto;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
          background: rgba(255,255,255,0.04); border: 1px solid var(--rule);
          padding: 1px 8px; border-radius: 999px; min-width: 22px; text-align: center;
        }
        .issb-col.is-droptarget .issb-col-count {
          color: var(--signature); border-color: rgba(var(--signature-rgb), 0.40);
          background: rgba(var(--signature-rgb), 0.10);
        }
        .issb-col-body {
          flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 10px;
          overflow-y: auto; max-height: calc(100vh - 250px); scroll-behavior: smooth;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.06) transparent;
        }
        .issb-col-body::-webkit-scrollbar { width: 8px; }
        .issb-col-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 4px; }
        .issb-col-body::-webkit-scrollbar-thumb:hover { background: rgba(var(--signature-rgb), 0.3); }
        .light .issb-col-body::-webkit-scrollbar-thumb { background: rgba(20,14,30,0.08); }
        .issb-col-empty {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; color: var(--txt-faint); padding: 26px 8px; text-align: center;
          letter-spacing: 0.3px; border: 1px dashed var(--rule); border-radius: 8px;
          background: rgba(255,255,255,0.012);
        }
        .light .issb-col[data-col="open"], .light .issb-col[data-col="converted"], .light .issb-col[data-col="closed"] { --glow-alpha: 0; }
        .light .issb-col::before { animation: none; }

        @media (max-width: 860px) {
          .issb-board { grid-template-columns: 1fr; }
          .issb-col { min-height: 0; }
          .issb-col-body { max-height: none; }
        }
      `}</style>
    </div>
  );
}

function IssueCard({
  issue,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  issue: Issue;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const converting = issue.status === 'converting';
  const hasTasks = issue.taskCount > 0;

  return (
    <article
      className={`issb-card ${dragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      title={issue.description || issue.title}
    >
      <div className="issb-card-head">
        {converting ? (
          <span className="issb-card-fan is-live">splitting…</span>
        ) : hasTasks ? (
          <span className="issb-card-fan">
            <span aria-hidden="true">→</span> {issue.taskCount} task{issue.taskCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="issb-card-fan is-empty">intake</span>
        )}
        <span className="issb-card-date">{relDate(issue.createdAt)}</span>
      </div>
      <h3 className="issb-card-title">{issue.title}</h3>
      {issue.description && <p className="issb-card-desc">{issue.description}</p>}

      <style>{`
        .issb-card {
          position: relative; flex-shrink: 0;
          background: var(--glass-substrate); border: 1px solid var(--rule);
          border-radius: var(--r-sm); padding: 12px 13px;
          display: flex; flex-direction: column; gap: 7px; cursor: grab;
          isolation: isolate; overflow: hidden; box-shadow: var(--shadow-float);
          transition: border-color var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
        }
        .issb-card:hover { background: var(--glass-hover); border-color: rgba(var(--signature-rgb), 0.40); }
        .issb-card:focus-visible {
          outline: none; border-color: rgba(var(--signature-rgb), 0.55);
          box-shadow: var(--shadow-float), 0 0 0 2px rgba(var(--signature-rgb), 0.55);
        }
        .issb-card:active { cursor: grabbing; }
        .issb-card.is-dragging { opacity: 0.55; cursor: grabbing; border-color: rgba(var(--signature-rgb), 0.45); }

        .issb-card-head { display: flex; align-items: center; gap: 8px; }
        .issb-card-fan {
          display: inline-flex; align-items: center; gap: 4px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase;
          color: var(--signature); background: rgba(var(--signature-rgb), 0.10);
          border: 1px solid rgba(var(--signature-rgb), 0.20); border-radius: 999px; padding: 1px 8px;
        }
        .issb-card-fan.is-empty { color: var(--txt-faint); background: transparent; border-color: var(--rule); }
        .issb-card-fan.is-live { animation: issbShimmer 1.4s ease-in-out infinite; }
        @keyframes issbShimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .issb-card-date {
          margin-left: auto; font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; color: var(--txt-faint); font-variant-numeric: tabular-nums;
        }
        .issb-card-title {
          font-size: 13px; font-weight: 600; letter-spacing: -0.005em; color: var(--txt-pure);
          line-height: 1.35; margin: 0;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .issb-card-desc {
          font-size: 12px; color: var(--txt-faint); line-height: 1.4; margin: 0;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
      `}</style>
    </article>
  );
}

function IssueDetail({
  teamId,
  issueId,
  nameById,
  onClose,
}: {
  teamId: string;
  issueId: string;
  nameById: Map<string, string>;
  onClose: () => void;
}) {
  const { data, isLoading } = useSWR<{ issue: Issue; tasks: LinkedTask[] }>(
    `/api/teams/${teamId}/issues/${issueId}`,
    fetcher,
  );
  const issue = data?.issue;
  const tasks = data?.tasks ?? [];

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="issb-overlay" />
        <Dialog.Content className="issb-detail glass-card" aria-describedby={undefined}>
          <Dialog.Title className="issb-detail-title">{issue?.title ?? 'Issue'}</Dialog.Title>
          {issue?.description && <p className="issb-detail-desc">{issue.description}</p>}

          <div className="recgon-label issb-detail-label">
            {issue && issue.taskCount > 0
              ? `Recgon split this into ${issue.taskCount} task${issue.taskCount === 1 ? '' : 's'}`
              : issue?.status === 'converting' ? 'Splitting…' : 'No tasks yet'}
          </div>

          {isLoading ? (
            <Skeleton style={{ height: 40 }} />
          ) : tasks.length === 0 ? (
            <p className="issb-detail-empty">No tasks linked yet — conversion will retry.</p>
          ) : (
            <div className="issb-tree">
              {tasks.map((task) => (
                <div key={task.id} className="issb-leaf">
                  <span className="issb-leaf-title">{task.title}</span>
                  <span className="issb-leaf-right">
                    <span className="issb-leaf-who">
                      {task.assignedTo ? (nameById.get(task.assignedTo) ?? 'assigned') : 'unassigned'}
                    </span>
                    <TaskStatusChip status={task.status} verification={task.verificationStatus as never} />
                  </span>
                </div>
              ))}
            </div>
          )}

          <Dialog.Close asChild>
            <button className="issb-detail-close" aria-label="Close">✕</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>

      <style>{`
        .issb-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          backdrop-filter: blur(2px); z-index: 200;
          animation: issbFade 0.2s var(--ease-out);
        }
        @keyframes issbFade { from { opacity: 0; } to { opacity: 1; } }
        .issb-detail {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: min(560px, calc(100vw - 32px)); max-height: 80vh; overflow-y: auto;
          z-index: 201; padding: 26px !important;
          animation: issbPop 0.22s var(--ease-out);
        }
        @keyframes issbPop { from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        .issb-detail-title { font-size: 18px; font-weight: 700; color: var(--txt-pure); margin: 0 36px 0 0; line-height: 1.3; }
        .issb-detail-desc { font-size: 13px; color: var(--txt-muted); line-height: 1.55; margin: 10px 0 0; white-space: pre-wrap; }
        .issb-detail-label { margin: 20px 0 10px 27px; }
        .issb-detail-empty { font-size: 12px; color: var(--txt-faint); margin-left: 27px; }
        .issb-tree { margin-left: 27px; border-left: 1.5px solid rgba(var(--signature-rgb), 0.22); }
        .issb-leaf {
          position: relative; display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 9px 0 9px 20px;
        }
        .issb-leaf::before {
          content: ''; position: absolute; left: 0; top: 50%; width: 15px; height: 1.5px;
          background: rgba(var(--signature-rgb), 0.22);
        }
        .issb-leaf-title {
          font-size: 13px; color: var(--txt-muted); min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .issb-leaf-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .issb-leaf-who { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: var(--txt-faint); }
        .issb-detail-close {
          position: absolute; top: 18px; right: 18px; width: 28px; height: 28px;
          display: grid; place-items: center; border-radius: 8px;
          background: transparent; border: 1px solid var(--rule); color: var(--txt-muted);
          cursor: pointer; font-size: 13px; transition: all var(--dur-fast) var(--ease-out);
        }
        .issb-detail-close:hover { color: var(--signature); border-color: rgba(var(--signature-rgb), 0.4); }
      `}</style>
    </Dialog.Root>
  );
}

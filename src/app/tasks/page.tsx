'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import Link from 'next/link';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Skeleton } from '@/components/ui';
import { ProofDropZone } from '@/components/ProofDropZone';
import { TaskStatusChip } from '@/components/TaskStatusChip';
import type { VerificationEvidence, VerificationStatus } from '@/lib/recgon/types';
import { OverdueChip } from '@/components/v2/calendar/OverdueChip';
import { daysOverdue, isOverdue } from '@/lib/recgon/overduePolicy';

interface TaskItem {
  id: string;
  team_id: string;
  teamName?: string;
  project_id: string | null;
  title: string;
  description: string;
  kind: string;
  source: string;
  priority: number;
  status: 'assigned' | 'accepted' | 'in_progress' | 'awaiting_review';
  assigned_at: string;
  deadline: string | null;
  scheduled_date: string | null;
  scheduled_until_date: string | null;
  schedule_note: string | null;
  reschedule_request_status?: 'none' | 'pending' | 'resolved' | 'dismissed';
  reschedule_requested_at?: string | null;
  reschedule_requested_by?: string | null;
  reschedule_request_note?: string | null;
  reschedule_requested_date?: string | null;
  result: Record<string, unknown> | null;
  verification_status?: VerificationStatus;
  verification_evidence?: VerificationEvidence | null;
  // Phase 3.6 / Plan 04 — derived overdue book-keeping. Tier 0..3 (last
  // action by the daily cron); we derive `isOverdue` state from
  // scheduled_date + status via the shared `overduePolicy` helper.
  overdue_tier?: number | null;
  last_overdue_action_at?: string | null;
}

// Adapter — TaskItem uses snake_case shape; the pure `isOverdue` /
// `daysOverdue` helpers consume camelCase AgentTask-shaped objects. Keep
// the adapter local so the policy module stays the single source of truth.
function taskItemToOverdueShape(t: TaskItem) {
  return {
    status: t.status,
    scheduledDate: t.scheduled_date,
    scheduledUntilDate: t.scheduled_until_date,
    assignedTo: 'self', // /tasks lists only the viewer's tasks; non-null is enough for the policy gate
  } as const;
}

type ColumnKey = 'assigned' | 'wip' | 'review';

const COLUMNS: { key: ColumnKey; label: string; tone: string; toneRgb: string; status: string[] }[] = [
  { key: 'assigned', label: 'assigned',    tone: 'var(--txt-muted)',  toneRgb: '160, 160, 168',     status: ['assigned'] },
  { key: 'wip',      label: 'in progress', tone: 'var(--signature)',  toneRgb: 'var(--signature-rgb)', status: ['accepted', 'in_progress'] },
  { key: 'review',   label: 'in review',   tone: 'var(--warning)',    toneRgb: '255, 159, 10',      status: ['awaiting_review'] },
];

const KIND_LABEL: Record<string, string> = {
  next_step: 'next step',
  dev_prompt: 'dev',
  marketing: 'marketing',
  analytics: 'analytics',
  research: 'research',
  custom: 'task',
};

type RelTime = { unit: 'justNow' | 'minutes' | 'hours' | 'days'; count: number };
function relTime(iso: string | null): RelTime | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return { unit: 'justNow', count: 0 };
  if (ms < 3_600_000) return { unit: 'minutes', count: Math.round(ms / 60_000) };
  if (ms < 86_400_000) return { unit: 'hours', count: Math.round(ms / 3_600_000) };
  return { unit: 'days', count: Math.round(ms / 86_400_000) };
}

// Returns the localized date string plus whether it represents a deadline
// (which the caller wraps in the "due {date}" message).
function fmtSchedule(item: Pick<TaskItem, 'scheduled_date' | 'deadline'>): { date: string; isDeadline: boolean } | null {
  if (item.scheduled_date) {
    const d = new Date(`${item.scheduled_date}T00:00:00`);
    return { date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), isDeadline: false };
  }
  if (!item.deadline) return null;
  const due = new Date(item.deadline);
  return { date: due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), isDeadline: true };
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  // YYYY-MM-DD already, or ISO datetime — normalize to YYYY-MM-DD.
  return value.slice(0, 10);
}

function fmtRescheduleRequest(t: Pick<TaskItem, 'reschedule_requested_date'>): string | null {
  if (!t.reschedule_requested_date) return null;
  const d = new Date(`${t.reschedule_requested_date}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function priorityChip(p: number): { labelKey: 'urgent' | 'high'; color: string } | null {
  if (p <= 0) return { labelKey: 'urgent', color: 'var(--danger)' };
  if (p === 1) return { labelKey: 'high', color: 'var(--warning)' };
  return null;
}

function cleanText(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*\*/g, '').replace(/__/g, '');
}

function columnFor(t: TaskItem): ColumnKey | null {
  for (const col of COLUMNS) if (col.status.includes(t.status)) return col.key;
  return null;
}

function needsProof(t: TaskItem): boolean {
  return t.verification_status === 'proof_requested' || t.verification_status === 'failed';
}

// Supported drag transitions:
//   assigned → wip    = accept
//   wip      → review = complete
// Anything else snaps back. (No API for un-accept or un-complete.)
function validDrop(from: ColumnKey, to: ColumnKey): 'accept' | 'complete' | null {
  if (from === to) return null;
  if (from === 'assigned' && to === 'wip') return 'accept';
  if (from === 'wip' && to === 'review') return 'complete';
  return null;
}

function V2TasksInner() {
  const t = useTranslations('tasks');
  const { projects: teamProjects } = useTeam();
  const projects = useMemo(() => teamProjects ?? [], [teamProjects]);
  const { addToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  // Phase 3.6 / Plan 04 — when true, only render tasks the policy considers
  // overdue today. Empty state copy switches accordingly.
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [proofText, setProofText] = useState<string>('');
  const [proofLinks, setProofLinks] = useState<string>('');
  const [proofAttachments, setProofAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<ColumnKey | null>(null);
  // Optimistic moves keep the card in the destination column while the API
  // call is in flight, preventing the visible "jump back" before refresh.
  const [optimistic, setOptimistic] = useState<Record<string, ColumnKey>>({});
  // Phase 3 / Plan 03 — Why you sentence for the currently expanded task.
  // Fetched lazily from /api/recgon/tasks/[id] when a task panel opens, so
  // the raw assignment_reasoning JSONB never travels via /api/inbox.
  const [whyYouMap, setWhyYouMap] = useState<Record<string, string>>({});

  // Inbox tasks come from SWR — cached across navigations, so returning to the
  // Tasks tab paints the last board instantly and revalidates in the
  // background (no skeleton). While a verification is mid-flight we poll every
  // 1.5s via a dynamic refreshInterval (same cadence as the old manual timer);
  // otherwise polling is off. Focus revalidation is handled by SWRConfig.
  const { data: inboxData, mutate: mutateInbox } = useSWR<{ tasks?: TaskItem[] }>(
    '/api/inbox',
    {
      refreshInterval: (latest) => {
        const list = Array.isArray(latest?.tasks) ? (latest!.tasks as TaskItem[]) : [];
        const verifying = list.some(
          (t) => t.verification_status === 'auto_running' || t.verification_status === 'proof_evaluating',
        );
        return verifying ? 1500 : 0;
      },
    },
  );

  const tasks = useMemo<TaskItem[]>(() => {
    const list = Array.isArray(inboxData?.tasks) ? (inboxData!.tasks as TaskItem[]) : [];
    const LIVE = new Set(['unassigned', 'assigned', 'accepted', 'in_progress', 'awaiting_review']);
    return list.filter((t) => LIVE.has(t.status));
  }, [inboxData]);
  const loading = inboxData === undefined;

  // Re-pull the inbox after a mutation (accept / complete / proof / reschedule).
  const refresh = useCallback(() => mutateInbox(), [mutateInbox]);

  // Mark tasks as "seen" once the user lands here so the nav badge dot
  // clears. Re-stamps on focus too in case a new task arrives while the
  // page was open in another tab.
  useEffect(() => {
    const stamp = () => {
      try { window.localStorage.setItem('v2:tasks:lastSeenAt', new Date().toISOString()); } catch { /* swallowed */ }
      window.dispatchEvent(new CustomEvent('v2:tasks-seen'));
    };
    stamp();
    window.addEventListener('focus', stamp);
    return () => window.removeEventListener('focus', stamp);
  }, []);

  // Clear stale optimistic entries once the server state catches up. Once a
  // task's real column matches the predicted one (or the task is gone), we
  // can drop the optimistic placement.
  useEffect(() => {
    setOptimistic((prev) => {
      let changed = false;
      const next: Record<string, ColumnKey> = {};
      for (const id of Object.keys(prev)) {
        const t = tasks.find((x) => x.id === id);
        if (!t) { changed = true; continue; }
        const realCol = columnFor(t);
        if (realCol === prev[id]) { changed = true; continue; }
        next[id] = prev[id];
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const today = new Date();
    let base = tasks;
    if (overdueOnly) {
      base = base.filter((t) => isOverdue(taskItemToOverdueShape(t), today));
    }
    if (!q) return base;
    return base.filter((t) => {
      const title = (t.title ?? '').toLowerCase();
      const desc = (t.description ?? '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [tasks, searchQuery, overdueOnly]);

  // Phase 3.6 / Plan 04 — pre-computed count of overdue tasks so the filter
  // chip can show a badge ("overdue · 3"). Recomputes on the same clock
  // `filtered` uses, so the chip and the filtered list stay consistent.
  const overdueCount = useMemo(() => {
    const today = new Date();
    return tasks.reduce((acc, t) => acc + (isOverdue(taskItemToOverdueShape(t), today) ? 1 : 0), 0);
  }, [tasks]);

  const grouped = useMemo(() => {
    const out: Record<ColumnKey, TaskItem[]> = { assigned: [], wip: [], review: [] };
    for (const t of filtered) {
      const realCol = columnFor(t);
      const col = optimistic[t.id] ?? realCol;
      if (!col) continue;
      out[col].push(t);
    }
    // Inside each column: needs-attention first, then by assigned_at desc.
    const sortPile = (arr: TaskItem[]) =>
      arr.sort((a, b) => {
        const aAtt = needsProof(a) || a.status === 'assigned';
        const bAtt = needsProof(b) || b.status === 'assigned';
        if (aAtt !== bAtt) return aAtt ? -1 : 1;
        return new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime();
      });
    sortPile(out.assigned);
    sortPile(out.wip);
    sortPile(out.review);
    return out;
  }, [filtered, optimistic]);

  const totalCount = filtered.length;

  const callAction = useCallback(async (task: TaskItem, action: 'accept' | 'decline' | 'complete') => {
    const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || t('toast.actionFailed', { action }));
    }
    return res;
  }, [t]);

  const act = useCallback(async (task: TaskItem, action: 'accept' | 'decline' | 'complete') => {
    if (working) return;
    setWorking(task.id);
    try {
      const res = await callAction(task, action);
      if (action === 'decline') {
        const { reassignedTo, ownerFallback } = await res.json().catch(() => ({}));
        addToast(
          ownerFallback
            ? t('toast.declinedOwner')
            : reassignedTo
              ? t('toast.declinedReassigned')
              : t('toast.declinedWillReassign'),
          'success',
        );
      } else {
        addToast(action === 'accept' ? t('toast.accepted') : t('toast.markedComplete'), 'success');
      }
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.actionFailed', { action }), 'error');
    } finally {
      setWorking(null);
    }
  }, [working, callAction, addToast, refresh, t]);

  const handleDrop = useCallback(async (task: TaskItem, target: ColumnKey) => {
    const from = columnFor(task);
    if (!from) return;
    const action = validDrop(from, target);
    if (!action) {
      addToast(t('toast.cantMove', { from: t(`columns.${from}`), to: t(`columns.${target}`) }), 'error');
      return;
    }
    setOptimistic((p) => ({ ...p, [task.id]: target }));
    try {
      await callAction(task, action);
      addToast(action === 'accept' ? t('toast.accepted') : t('toast.markedComplete'), 'success');
      await refresh();
    } catch (err) {
      // Rollback on failure.
      setOptimistic((p) => { const c = { ...p }; delete c[task.id]; return c; });
      addToast(err instanceof Error ? err.message : t('toast.actionFailed', { action }), 'error');
    }
  }, [callAction, addToast, refresh, t]);

  const handleUploadProofFile = useCallback(async (task: TaskItem, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/proof/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('toast.uploadFailed'));
      }
      const { attachments } = (await res.json()) as { attachments: Array<{ name: string; url: string }> };
      setProofAttachments((p) => [...p, ...attachments]);
      addToast(t('toast.filesAttached', { count: attachments.length }), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.uploadFailed'), 'error');
    } finally {
      setUploadingFile(false);
    }
  }, [addToast, t]);

  const submitProof = useCallback(async (task: TaskItem) => {
    if (working === task.id) return;
    const text = proofText.trim();
    const linksRaw = proofLinks.trim();
    const links = linksRaw ? linksRaw.split(/\s+/).filter(Boolean) : [];
    if (!text && links.length === 0 && proofAttachments.length === 0) {
      addToast(t('toast.proofMissing'), 'error');
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
          attachments: proofAttachments.length ? proofAttachments : undefined,
          submittedAt: new Date().toISOString(),
          submittedBy: 'self',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('toast.proofSubmitFailed'));
      }
      addToast(t('toast.proofSent'), 'success');
      setProofText('');
      setProofLinks('');
      setProofAttachments([]);
      setExpanded(null);
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.failed'), 'error');
    } finally {
      setWorking(null);
    }
  }, [working, proofText, proofLinks, proofAttachments, addToast, refresh, t]);

  const submitRescheduleRequest = useCallback(async (task: TaskItem) => {
    if (working === task.id) return;
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/reschedule-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: rescheduleNote.trim(),
          requestedDate: rescheduleDate || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('toast.rescheduleFailed'));
      }
      addToast(t('toast.rescheduleSent'), 'success');
      setRescheduleOpen(false);
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.requestFailed'), 'error');
    } finally {
      setWorking(null);
    }
  }, [addToast, refresh, rescheduleDate, rescheduleNote, working, t]);

  const expandedTask = useMemo(
    () => (expanded ? tasks.find((t) => t.id === expanded) ?? null : null),
    [expanded, tasks],
  );

  useEffect(() => {
    if (!expandedTask) {
      setRescheduleOpen(false);
      setRescheduleNote('');
      setRescheduleDate('');
      return;
    }
    setRescheduleOpen(false);
    setRescheduleNote(expandedTask.reschedule_request_note ?? '');
    setRescheduleDate(toDateInput(expandedTask.reschedule_requested_date ?? expandedTask.scheduled_date));
  }, [
    expandedTask?.id,
    expandedTask?.reschedule_request_note,
    expandedTask?.reschedule_requested_date,
    expandedTask?.scheduled_date,
  ]);

  // Close detail panel with Escape.
  useEffect(() => {
    if (!expandedTask) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedTask]);

  // Phase 3 / Plan 03 — fetch the Why-you sentence for the expanded task.
  // The server-side privacy filter at /api/recgon/tasks/[id] gates which
  // viewers receive `whyYouSentence` (assignee + team owner only). Raw
  // assignment_reasoning JSONB never leaves that endpoint, so this fetch is
  // safe to call for any viewer — non-authorized viewers simply get a
  // response without the field, and the block below stays hidden.
  useEffect(() => {
    if (!expandedTask) return;
    const taskId = expandedTask.id;
    if (whyYouMap[taskId] !== undefined) return; // already fetched
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recgon/tasks/${taskId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const sentence: string | undefined = data?.task?.whyYouSentence;
        if (!cancelled && typeof sentence === 'string' && sentence.length > 0) {
          setWhyYouMap((prev) => ({ ...prev, [taskId]: sentence }));
        }
      } catch { /* swallowed — block stays hidden on fetch error */ }
    })();
    return () => { cancelled = true; };
  }, [expandedTask?.id]);

  /* REAL lighting — SVG feSpecularLighting with a feDistantLight
     gives a uniform directional light (top-left, elevation 55°)
     that produces clean Phong shading on each card's bevels: top
     and left bevels lit, bottom and right bevels dark, no grazing-
     angle ghost on bottom corners. Per-card distance variation is
     added via --dist-alpha on each .v2-tasks-card-bg, computed
     here from each card's distance to its column dot. Cards close
     to the dot fade in to full intensity; far cards fade out. */
  useEffect(() => {
    if (loading) return;
    const board = document.querySelector<HTMLElement>('.v2-tasks-board');
    if (!board) return;

    const DOT_OFFSET_X = 22;
    const DOT_OFFSET_Y = 22;
    // Distance (in px from card center to column dot) at which the
    // card's specular fades to zero. Roughly column body height.
    const FALLOFF_PX = 700;

    let raf = 0;
    const compute = () => {
      raf = 0;
      board.querySelectorAll<HTMLElement>('.v2-tasks-col').forEach((col) => {
        const cr = col.getBoundingClientRect();
        const dotX = cr.left + DOT_OFFSET_X;
        const dotY = cr.top + DOT_OFFSET_Y;
        col.querySelectorAll<HTMLElement>('.v2-tasks-card').forEach((card) => {
          const r = card.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const d = Math.hypot(cx - dotX, cy - dotY);
          // sqrt curve so close cards punch and far cards still
          // pick up a hint instead of going pitch black
          const linear = Math.max(0, 1 - d / FALLOFF_PX);
          const alpha = Math.sqrt(linear).toFixed(3);
          const bg = card.querySelector<HTMLElement>('.v2-tasks-card-bg');
          if (bg) bg.style.setProperty('--dist-alpha', alpha);
        });
      });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute); };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(board);
    board.querySelectorAll<HTMLElement>('.v2-tasks-col, .v2-tasks-col-body').forEach((el) => ro.observe(el));

    const mo = new MutationObserver(() => {
      board.querySelectorAll<HTMLElement>('.v2-tasks-col-body').forEach((el) => ro.observe(el));
      schedule();
    });
    mo.observe(board, { childList: true, subtree: true });

    const bodies = Array.from(board.querySelectorAll<HTMLElement>('.v2-tasks-col-body'));
    const onScroll = () => schedule();
    bodies.forEach((b) => b.addEventListener('scroll', onScroll, { passive: true }));
    window.addEventListener('resize', schedule);
    // Page-level scroll moves the columns in viewport space too
    window.addEventListener('scroll', schedule, { passive: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      bodies.forEach((b) => b.removeEventListener('scroll', onScroll));
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loading]);

  return (
    <div className="v2-tasks">
      {/* Real lighting via SVG filters. One filter per column; each
          contains a <fePointLight> whose x/y is moved (in the
          light-tracking useEffect below) to the live viewport position
          of that column's dot. primitiveUnits=userSpaceOnUse means the
          light coords are absolute viewport pixels — same filter
          applied to every card in a column produces a different
          highlight on each card because each card's pixels live at
          different world coords. The filter outputs only the masked
          specular (no feMerge of SourceGraphic), so the bg div appears
          as just the highlight; the card's glass body shows through. */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <filter id="lit-glass-assigned" primitiveUnits="userSpaceOnUse"
                  x="-50%" y="-50%" width="200%" height="200%"
                  colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="bump" />
            <feSpecularLighting in="bump" result="spec"
                                surfaceScale="2" specularConstant="0.85"
                                specularExponent="80" lightingColor="#e8eaed">
              <feDistantLight azimuth="225" elevation="12" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="lit" />
          </filter>
          <filter id="lit-glass-wip" primitiveUnits="userSpaceOnUse"
                  x="-50%" y="-50%" width="200%" height="200%"
                  colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="bump" />
            <feSpecularLighting in="bump" result="spec"
                                surfaceScale="2" specularConstant="0.85"
                                specularExponent="80" lightingColor="#e8a8c4">
              <feDistantLight azimuth="225" elevation="12" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="lit" />
          </filter>
          <filter id="lit-glass-review" primitiveUnits="userSpaceOnUse"
                  x="-50%" y="-50%" width="200%" height="200%"
                  colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="bump" />
            <feSpecularLighting in="bump" result="spec"
                                surfaceScale="2" specularConstant="0.85"
                                specularExponent="80" lightingColor="#ff9f0a">
              <feDistantLight azimuth="225" elevation="12" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="lit" />
          </filter>
        </defs>
      </svg>

      <header className="v2-section-head">
        <span className="recgon-label v2-eyebrow">{t('eyebrow')}</span>

        <div className="v2-tasks-search-wrap">
          <span className="v2-tasks-search-glyph" aria-hidden="true">›</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="v2-tasks-search"
            aria-label={t('search.aria')}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="v2-tasks-search-clear"
              aria-label={t('search.clear')}
            >×</button>
          )}
        </div>

        {/* Phase 3.6 / Plan 04 — overdue filter. Sits alongside search;
            when active, the task list narrows to `isOverdue(task, today)`
            and the column empty-states swap to the overdue copy. */}
        <button
          type="button"
          className={`v2-tasks-filter-chip${overdueOnly ? ' is-active' : ''}`}
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
          data-filter="overdue"
        >
          <span className="v2-tasks-filter-dot" aria-hidden="true" />
          <span>{t('filters.overdue')}</span>
          {overdueCount > 0 && <span className="v2-tasks-filter-count">{overdueCount}</span>}
        </button>
      </header>

      {loading ? (
        <div className="v2-tasks-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="v2-tasks-col">
              <div className="v2-tasks-col-head">
                <span className="v2-tasks-col-label" style={{ color: col.tone }}>{t(`columns.${col.key}`)}</span>
              </div>
              <div className="v2-tasks-col-body">
                {[1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={86} radius={10} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="v2-tasks-board">
          {COLUMNS.map((col) => {
            const items = grouped[col.key];
            const isHover = hoverCol === col.key;
            return (
              <div
                key={col.key}
                data-col={col.key}
                className={`v2-tasks-col ${isHover ? 'is-droptarget' : ''}`}
                onDragOver={(e) => {
                  if (!draggedId) return;
                  const dragged = tasks.find((t) => t.id === draggedId);
                  if (!dragged) return;
                  const from = columnFor(dragged);
                  if (!from) return;
                  if (validDrop(from, col.key)) {
                    e.preventDefault();
                    setHoverCol(col.key);
                  }
                }}
                onDragLeave={() => { if (hoverCol === col.key) setHoverCol(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setHoverCol(null);
                  if (!draggedId) return;
                  const dragged = tasks.find((t) => t.id === draggedId);
                  setDraggedId(null);
                  if (!dragged) return;
                  void handleDrop(dragged, col.key);
                }}
              >
                <div className="v2-tasks-col-head">
                  <span className="v2-tasks-col-dot" style={{ background: col.tone }} aria-hidden="true" />
                  <span className="v2-tasks-col-label" style={{ color: col.tone }}>{t(`columns.${col.key}`)}</span>
                  <span className="v2-tasks-col-count">{items.length}</span>
                </div>
                <div className="v2-tasks-col-body">
                  {items.length === 0 ? (
                    <div className="v2-tasks-col-empty">
                      {overdueOnly
                        ? t('empty.overdueClear')
                        : t(`empty.${col.key}`)}
                    </div>
                  ) : (
                    items.map((task) => {
                      const chip = priorityChip(task.priority);
                      const projectName = task.project_id ? projectNameById.get(task.project_id) : null;
                      const proof = needsProof(task);
                      const reschedulePending = task.reschedule_request_status === 'pending';
                      const isDragging = draggedId === task.id;
                      const schedule = fmtSchedule(task);
                      return (
                        <article
                          key={task.id}
                          className={`v2-tasks-card ${proof ? 'is-attn' : ''} ${isDragging ? 'is-dragging' : ''}`}
                          draggable
                          onDragStart={(e) => {
                            setDraggedId(task.id);
                            e.dataTransfer.effectAllowed = 'move';
                            // Some browsers need data set to start a drag.
                            try { e.dataTransfer.setData('text/plain', task.id); } catch { /* swallowed */ }
                          }}
                          onDragEnd={() => { setDraggedId(null); setHoverCol(null); }}
                          onClick={() => setExpanded(task.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpanded(task.id);
                            }
                          }}
                          title={cleanText(task.description || task.title)}
                        >
                          {/* Filter target — the SVG specular lighting is
                              applied to this opaque-white div so it doesn't
                              filter (and blur) the card's text content. */}
                          <div className="v2-tasks-card-bg" aria-hidden="true" />
                          <div className="v2-tasks-card-head">
                            <span className="v2-tasks-card-kind">{KIND_LABEL[task.kind] ? t(`kind.${task.kind}`) : task.kind}</span>
                            {chip && (
                              <span className="v2-tasks-card-prio" style={{ color: chip.color, borderColor: chip.color }}>
                                {t(`priority.${chip.labelKey}`)}
                              </span>
                            )}
                            {proof && <span className="v2-tasks-card-flag">{t('flags.proof')}</span>}
                            {reschedulePending && <span className="v2-tasks-card-flag is-reschedule">{t('flags.move')}</span>}
                          </div>
                          <h3 className="v2-tasks-card-title">{cleanText(task.title)}</h3>
                          <div className="v2-tasks-card-foot">
                            {projectName && <span className="v2-tasks-card-chip">{projectName}</span>}
                            {!projectName && task.teamName && (
                              <span className="v2-tasks-card-chip" title={t('teamTitle', { name: task.teamName })}>{task.teamName}</span>
                            )}
                            {schedule && <span className="v2-tasks-card-schedule" title={task.schedule_note ?? undefined}>{schedule.isDeadline ? t('schedule.due', { date: schedule.date }) : schedule.date}</span>}
                            {(() => {
                              // Phase 3.6 / Plan 04 — overdue chip inline
                              // alongside schedule text. /tasks shows only
                              // the viewer's own tasks (assignee view), so
                              // ownerView stays false — uniform pink chip.
                              const today = new Date();
                              const shape = taskItemToOverdueShape(task);
                              if (!isOverdue(shape, today)) return null;
                              const endKey = task.scheduled_until_date ?? task.scheduled_date;
                              if (!endKey) return null;
                              const days = Math.max(1, daysOverdue(endKey, today));
                              const tier = ((task.overdue_tier ?? 0) as 0 | 1 | 2 | 3);
                              return <OverdueChip tier={tier} days={days} ownerView={false} />;
                            })()}
                            <span className="v2-tasks-card-time">{(() => { const r = relTime(task.assigned_at); return r ? (r.unit === 'justNow' ? t('relTime.justNow') : t(`relTime.${r.unit}`, { count: r.count })) : ''; })()}</span>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expandedTask && (() => {
        const task = expandedTask;
        const chip = priorityChip(task.priority);
        const projectName = task.project_id ? projectNameById.get(task.project_id) : null;
        const isWorking = working === task.id;
        const proof = needsProof(task);
        const isAssigned = task.status === 'assigned';
        const isInFlight = task.status === 'accepted' || task.status === 'in_progress';
        const schedule = fmtSchedule(task);
        const reschedulePending = task.reschedule_request_status === 'pending';
        const requestedWindow = fmtRescheduleRequest(task);
        const rel = relTime(task.assigned_at);
        return (
          <div className="v2-tasks-overlay" onClick={() => setExpanded(null)}>
            <aside
              className="v2-tasks-detail"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={t('detail.aria')}
            >
              <button
                type="button"
                className="v2-tasks-detail-close"
                onClick={() => setExpanded(null)}
                aria-label={t('detail.close')}
              >×</button>

              <div className="v2-tasks-detail-head">
                <div className="v2-tasks-detail-kindrow">
                  <span className="recgon-label v2-tasks-detail-kind">{KIND_LABEL[task.kind] ? t(`kind.${task.kind}`) : task.kind}</span>
                  {chip && (
                    <span className="v2-tasks-card-prio" style={{ color: chip.color, borderColor: chip.color }}>
                      {t(`priority.${chip.labelKey}`)}
                    </span>
                  )}
                </div>
                <h2 className="v2-tasks-detail-title">{cleanText(task.title)}</h2>
                <div className="v2-tasks-detail-meta">
                  {projectName && <span className="v2-tasks-card-chip">{projectName}</span>}
                  {!projectName && task.teamName && (
                    <span className="v2-tasks-card-chip">{task.teamName}</span>
                  )}
                  {schedule && <span className="v2-tasks-card-schedule" title={task.schedule_note ?? undefined}>{schedule.isDeadline ? t('schedule.due', { date: schedule.date }) : schedule.date}</span>}
                  {reschedulePending && <span className="v2-tasks-card-flag is-reschedule">{t('flags.moveRequested')}</span>}
                  <span className="v2-tasks-card-time">{rel ? (rel.unit === 'justNow' ? t('relTime.justNow') : t(`relTime.${rel.unit}`, { count: rel.count })) : ''}</span>
                </div>
              </div>

              <div className="v2-tasks-detail-chiprow">
                <TaskStatusChip
                  status={task.status}
                  verification={task.verification_status}
                  evidence={task.verification_evidence ?? null}
                />
              </div>

              {whyYouMap[task.id] && (
                <div className="v2-tasks-detail-whyyou">
                  <span className="recgon-label v2-block-eye">{t('detail.whyYou')}</span>
                  <p className="v2-tasks-detail-whyyou-sentence">{whyYouMap[task.id]}</p>
                </div>
              )}

              {task.description && <p className="v2-tasks-detail-desc">{cleanText(task.description)}</p>}

              {reschedulePending && (
                <div className="v2-tasks-reschedule-note">
                  <span className="recgon-label v2-block-eye">{t('detail.rescheduleRequested')}</span>
                  {requestedWindow && <p className="v2-tasks-reschedule-window">{requestedWindow}</p>}
                  {task.reschedule_request_note && <p className="v2-tasks-proof-hint">{task.reschedule_request_note}</p>}
                </div>
              )}

              <div className="v2-tasks-detail-actions">
                {isAssigned && (
                  <>
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary"
                      onClick={() => act(task, 'accept')}
                      disabled={isWorking}
                    >
                      {isWorking ? <><span className="v2-inline-spinner" aria-hidden="true" />{t('actions.working')}</> : t('actions.accept')}
                    </button>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost"
                      onClick={() => act(task, 'decline')}
                      disabled={isWorking}
                    >{t('actions.decline')}</button>
                  </>
                )}

                {isInFlight && !proof && (
                  <>
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary"
                      onClick={() => act(task, 'complete')}
                      disabled={isWorking}
                    >
                      {isWorking ? <><span className="v2-inline-spinner" aria-hidden="true" />{t('actions.working')}</> : t('actions.markDone')}
                    </button>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost"
                      onClick={() => act(task, 'decline')}
                      disabled={isWorking}
                    >{t('actions.handBack')}</button>
                  </>
                )}

                {task.project_id && (
                  <Link
                    href={`/projects/${task.project_id}/tasks`}
                    className="v2-btn v2-btn-ghost"
                  >{t('actions.openProject')}</Link>
                )}

                <button
                  type="button"
                  className={`v2-btn ${reschedulePending ? 'v2-btn-primary' : 'v2-btn-ghost'}`}
                  onClick={() => setRescheduleOpen((v) => !v)}
                  disabled={isWorking}
                >
                  {reschedulePending ? t('actions.updateReschedule') : t('actions.requestReschedule')}
                </button>
              </div>

              {rescheduleOpen && (
                <div className="v2-tasks-reschedule-form">
                  <div className="v2-tasks-reschedule-grid">
                    <label className="v2-tasks-reschedule-field">
                      <span>{t('reschedule.preferredDay')}</span>
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="v2-tasks-proof-input v2-tasks-proof-links"
                      />
                    </label>
                  </div>
                  <textarea
                    value={rescheduleNote}
                    onChange={(e) => setRescheduleNote(e.target.value)}
                    placeholder={t('reschedule.notePlaceholder')}
                    className="v2-tasks-proof-input"
                    rows={3}
                  />
                  <div className="v2-tasks-proof-actions">
                    <button
                      type="button"
                      className="v2-btn v2-btn-primary"
                      onClick={() => submitRescheduleRequest(task)}
                      disabled={isWorking}
                    >
                      {isWorking ? t('reschedule.sending') : t('reschedule.sendRequest')}
                    </button>
                  </div>
                </div>
              )}

              {proof && (
                <div className="v2-tasks-proof">
                  <span className="recgon-label v2-block-eye" style={{ color: 'var(--warning)' }}>{t('proof.needed')}</span>
                  <p className="v2-tasks-proof-hint">
                    {t('proof.hint')}
                  </p>
                  <textarea
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    placeholder={t('proof.describePlaceholder')}
                    className="v2-tasks-proof-input"
                    rows={3}
                  />
                  <input
                    type="text"
                    value={proofLinks}
                    onChange={(e) => setProofLinks(e.target.value)}
                    placeholder={t('proof.linksPlaceholder')}
                    className="v2-tasks-proof-input v2-tasks-proof-links"
                  />
                  <ProofDropZone
                    uploading={uploadingFile}
                    files={proofAttachments}
                    onPick={(files) => handleUploadProofFile(task, files)}
                    onRemove={(idx) => setProofAttachments((p) => p.filter((_, i) => i !== idx))}
                  />
                  <p className="v2-tasks-proof-foot">
                    {t('proof.foot')}
                  </p>
                  <div className="v2-tasks-proof-actions">
                    <button
                      type="button"
                      className="v2-btn v2-btn-warn"
                      onClick={() => submitProof(task)}
                      disabled={isWorking}
                    >{isWorking ? t('proof.sending') : t('proof.submit')}</button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        );
      })()}

      <style>{`
        .v2-tasks {
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding-bottom: 32px;
          animation: v2pageFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2pageFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }

        .v2-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 0;
        }
        .v2-section-headline {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .v2-eyebrow { color: var(--signature); margin: 0; }
        .v2-section-title {
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: -0.005em;
          color: var(--txt-pure);
          margin: 0;
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .v2-section-title-tail {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--txt-muted);
          letter-spacing: 0.2px;
        }
        .v2-pink {
          color: var(--signature);
          font-variant-numeric: tabular-nums;
          font-size: 22px;
          font-weight: 700;
          line-height: 1;
        }

        .v2-tasks-search-wrap {
          flex: 0 1 320px;
          min-width: 220px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--rule);
          border-radius: 10px;
          transition: border-color 180ms ease;
        }
        .v2-tasks-search-wrap:focus-within {
          border-color: rgba(var(--signature-rgb), 0.40);
        }
        .v2-tasks-search-glyph {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 13px;
          color: var(--signature);
          flex-shrink: 0;
        }
        .v2-tasks-search {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--txt-pure);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          letter-spacing: 0.1px;
        }
        .v2-tasks-search::placeholder { color: var(--txt-faint); }
        .v2-tasks-search-clear {
          background: transparent;
          border: none;
          width: 20px; height: 20px;
          color: var(--txt-faint);
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          border-radius: 4px;
          transition: color 180ms ease, background 180ms ease;
        }
        .v2-tasks-search-clear:hover {
          color: var(--danger);
          background: rgba(248, 113, 113, 0.10);
        }

        /* Phase 3.6 / Plan 04 — overdue filter chip. Inert outline by
           default, lights up to signature pink when active. The count
           badge inside the chip mirrors the column-count pill styling. */
        .v2-tasks-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 12px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 10px;
          cursor: pointer;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: lowercase;
          color: var(--txt-muted);
          transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
        }
        .v2-tasks-filter-chip:hover {
          color: var(--txt-pure);
          border-color: rgba(var(--signature-rgb), 0.35);
        }
        .v2-tasks-filter-chip.is-active {
          color: var(--signature);
          border-color: var(--signature);
          background: rgba(var(--signature-rgb), 0.06);
        }
        .v2-tasks-filter-chip:focus-visible {
          outline: 2px solid var(--signature);
          outline-offset: 2px;
        }
        .v2-tasks-filter-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.7;
          flex-shrink: 0;
        }
        .v2-tasks-filter-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: inherit;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid currentColor;
          padding: 0 6px;
          border-radius: 999px;
          min-width: 18px;
          text-align: center;
        }

        /* Board — hosts both the colored aurora light sources (::before)
           and the three glass columns. The columns are SEMI-TRANSPARENT
           so their backdrop-filter actually has something to sample —
           that's how the reflection becomes real, not painted on. */
        .v2-tasks-board {
          position: relative;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          isolation: isolate;
        }
        /* No external aurora — each column owns its own internal light
           source (see .v2-tasks-col::before below). That guarantees
           NOTHING bleeds into the gaps or page background, regardless
           of theme. The depth effect is automatic: gaps + page = dark,
           columns = lit from their dot. */

        /* Glass column — frosted pane that actually samples the aurora
           layer behind it. Background alpha is low on purpose: too opaque
           and backdrop-filter has nothing to do. Heavy blur + saturate is
           the Apple Music recipe for amplifying ambient color. */
        .v2-tasks-col {
          position: relative;
          z-index: 1;
          background:
            rgba(20, 20, 24, 0.42) padding-box,
            linear-gradient(135deg,
              rgba(255, 255, 255, 0.16) 0%,
              rgba(255, 255, 255, 0.04) 50%,
              rgba(255, 255, 255, 0.10) 100%) border-box;
          backdrop-filter: blur(60px) saturate(220%);
          -webkit-backdrop-filter: blur(60px) saturate(220%);
          border: 1px solid transparent;
          border-radius: 14px;
          box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
          display: flex;
          flex-direction: column;
          min-height: 320px;
          overflow: hidden;
          transition: box-shadow 280ms cubic-bezier(0.16, 1, 0.3, 1),
                      transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          transform: translateY(8px);
          animation: v2colIn 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .v2-tasks-board > .v2-tasks-col:nth-child(1) { animation-delay: 40ms; }
        .v2-tasks-board > .v2-tasks-col:nth-child(2) { animation-delay: 110ms; }
        .v2-tasks-board > .v2-tasks-col:nth-child(3) { animation-delay: 180ms; }
        @keyframes v2colIn {
          to { opacity: 1; transform: none; }
        }
        /* Internal light source — a radial gradient pinned to where
           the column's dot sits (≈22px from top-left). Light spills
           down and across the column glass, fading to transparent
           well before any edge — so the glow stays SELF-CONTAINED.
           Pulse syncs with v2colDotPulse so the dot visibly emits the
           light. Top sheen layered on for refraction realism. */
        .v2-tasks-col[data-col="assigned"] {
          --card-edge-rgb: 230, 235, 245;
          --glow-rgb: 220, 225, 240;
          --glow-alpha: 0.18;
        }
        .v2-tasks-col[data-col="wip"] {
          --card-edge-rgb: var(--signature-rgb);
          --glow-rgb: var(--signature-rgb);
          --glow-alpha: 0.55;
        }
        .v2-tasks-col[data-col="review"] {
          --card-edge-rgb: 255, 159, 10;
          --glow-rgb: 255, 159, 10;
          --glow-alpha: 0.48;
        }
        /* Column light pool — monotonically falling off from the dot.
           Brightest at the very center (where the lamp is), fading
           smoothly outward. No alpha ring artifact, no dark bloom in
           the center as the pulse animates. */
        .v2-tasks-col::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            /* Hot core — peak at center in the column's OWN tone
               (pink for wip, amber for review, etc.). Was hardcoded
               white, which made every dot bloom into a white halo
               regardless of column color. Now monochromatic. */
            radial-gradient(circle 70px at 22px 22px,
              rgba(var(--glow-rgb, 255, 255, 255), calc(var(--glow-alpha, 0) * 1.0)) 0%,
              rgba(var(--glow-rgb, 255, 255, 255), calc(var(--glow-alpha, 0) * 0.55)) 35%,
              rgba(var(--glow-rgb, 255, 255, 255), calc(var(--glow-alpha, 0) * 0.15)) 70%,
              rgba(var(--glow-rgb, 255, 255, 255), 0) 100%),
            /* Mid fill — gentle wash that fades by mid-column */
            radial-gradient(circle 360px at 22px 22px,
              rgba(var(--glow-rgb, 255, 255, 255), calc(var(--glow-alpha, 0) * 0.28)) 0%,
              rgba(var(--glow-rgb, 255, 255, 255), calc(var(--glow-alpha, 0) * 0.10)) 40%,
              rgba(var(--glow-rgb, 255, 255, 255), 0) 80%),
            /* Top glass sheen */
            linear-gradient(180deg,
              rgba(255, 255, 255, 0.05) 0%,
              transparent 25%);
          animation: v2colTonePulse 3.6s ease-in-out infinite;
        }
        @keyframes v2colTonePulse {
          0%, 100% { opacity: 0.78; }
          50%      { opacity: 1; }
        }
        /* Header + body sit ABOVE the glow so text stays sharp. */
        .v2-tasks-col-head,
        .v2-tasks-col-body { position: relative; z-index: 1; }

        .v2-tasks-col.is-droptarget {
          box-shadow:
            0 0 0 1px rgba(var(--signature-rgb), 0.55),
            0 0 36px 4px rgba(var(--signature-rgb), 0.22),
            var(--shadow-float);
          transform: translateY(-1px);
        }
        .v2-tasks-col.is-droptarget::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(120% 80% at 50% 0%,
            rgba(var(--signature-rgb), 0.10), transparent 60%);
          animation: v2dropPulse 1.4s ease-in-out infinite;
          z-index: 0;
        }
        @keyframes v2dropPulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }

        .v2-tasks-col-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 16px 12px;
          border-bottom: 1px solid var(--rule);
          background: linear-gradient(180deg,
            rgba(255,255,255,0.025) 0%,
            transparent 100%);
        }
        .v2-tasks-col-dot {
          width: 7px; height: 7px; border-radius: 50%;
          flex-shrink: 0;
          animation: v2colDotPulse 3.6s ease-in-out infinite;
        }
        /* Match the dot's text color to its background so box-shadow
           (currentColor) glows in the column's tone instead of the
           inherited grey text color. */
        .v2-tasks-col[data-col="assigned"] .v2-tasks-col-dot { color: var(--txt-muted); }
        .v2-tasks-col[data-col="wip"] .v2-tasks-col-dot      { color: var(--signature); }
        .v2-tasks-col[data-col="review"] .v2-tasks-col-dot   { color: var(--warning); }
        @keyframes v2colDotPulse {
          0%, 100% {
            box-shadow: 0 0 5px currentColor;
            transform: scale(1);
            opacity: 0.85;
          }
          50% {
            box-shadow: 0 0 12px currentColor, 0 0 22px currentColor;
            transform: scale(1.08);
            opacity: 1;
          }
        }
        .v2-tasks-col-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
        }
        .v2-tasks-col-count {
          margin-left: auto;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--rule);
          padding: 1px 8px;
          border-radius: 999px;
          min-width: 22px;
          text-align: center;
          transition: color 200ms ease, background 200ms ease, border-color 200ms ease;
        }
        .v2-tasks-col.is-droptarget .v2-tasks-col-count {
          color: var(--signature);
          border-color: rgba(var(--signature-rgb), 0.40);
          background: rgba(var(--signature-rgb), 0.10);
        }
        .v2-tasks-col-body {
          flex: 1;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          max-height: calc(100vh - 240px);
          scroll-behavior: smooth;
          /* Hide scrollbars across engines — scroll still works. */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .v2-tasks-col-body::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .v2-tasks-col-empty {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          padding: 28px 8px;
          text-align: center;
          letter-spacing: 0.3px;
          border: 1px dashed var(--rule);
          border-radius: 8px;
          background: rgba(255,255,255,0.012);
        }

        /* Glass card — "little glass box" that sits ON TOP of the column.
           Same liquid-glass formula as .glass-card (gradient border, edge
           highlight, edge shadow, float shadow). Border gradient picks up
           the parent column's tone via --card-edge-rgb so cards inside IN
           PROGRESS wear pink edges, IN REVIEW wear amber, etc. */
        .v2-tasks-card {
          position: relative;
          /* Critical: don't let the column's flex layout squash cards when
             many exist — keep their natural height; the column body scrolls
             instead. */
          flex-shrink: 0;
          background:
            var(--glass-substrate) padding-box,
            /* Uniform glass edge — a thin low-alpha bevel that defines
               the card's outline without painting a fake directional
               lit/shadow split. The directional bevel light is now
               computed by the SVG filter, so the border doesn't need
               to fake it anymore. */
            linear-gradient(135deg,
              rgba(255, 255, 255, 0.18) 0%,
              rgba(var(--card-edge-rgb, 255, 255, 255), 0.10) 50%,
              rgba(255, 255, 255, 0.18) 100%) border-box;
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid transparent;
          animation: v2cardIn 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          border-radius: 10px;
          padding: 12px 13px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: grab;
          isolation: isolate;
          overflow: hidden;
          /* Directional drop shadow — light is at top-left of the
             column, so shadows fall DOWN-RIGHT. Layered: a tight
             contact shadow + a soft long cast for real grounding. */
          box-shadow:
            2px 3px 6px -2px rgba(0, 0, 0, 0.55),
            6px 12px 24px -10px rgba(0, 0, 0, 0.65),
            12px 28px 48px -18px rgba(0, 0, 0, 0.45),
            var(--edge-highlight),
            var(--edge-shadow);
          opacity: 0;
          transform: translateY(4px);
          transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
                      box-shadow 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
                      background 240ms ease;
        }
        /* Old diagonal sheen pseudo removed — was a hard-coded
           165deg gradient that didn't respond to light position. The
           SVG feSpecularLighting on .v2-tasks-card-bg produces the
           real, light-driven sheen now. */
        /* Inert ::before — kept as a placeholder so the
           .v2-tasks-card.is-attn::before attention stripe (defined
           later) inherits the right inert properties. The actual card
           lighting is now done by SVG feSpecularLighting on the
           .v2-tasks-card-bg sibling div below — not by this pseudo. */
        .v2-tasks-card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: -1;
          border-radius: inherit;
        }

        /* Filter target — opaque-white sibling div whose alpha shape
           drives the SVG bump map. The filter outputs only the masked
           specular highlight (transparent elsewhere), so this div
           appears as just the highlight; the card's glass body
           (border, gradient, drop shadow) shows through unaltered.
           The filter is applied to THIS div, not the article, so card
           text is never filtered/blurred. */
        .v2-tasks-card-bg {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: #ffffff;
          pointer-events: none;
          z-index: 0;
          /* Per-card distance falloff. JS sets --dist-alpha (0..1)
             based on distance from this card's center to the column
             dot. Cards near the dot reflect strongly, far cards fade. */
          opacity: var(--dist-alpha, 1);
          /* Additive blend: filter output ADDS light to the card
             body (like a real reflection brightening glass), instead
             of REPLACING the surface (which would turn cards into
             solid lit tiles). Screen of black = unchanged, screen of
             white = pure white. */
          mix-blend-mode: screen;
          transition: opacity 240ms ease;
        }
        /* Light mode — the screen-blended specular reads as muddy
           gray smudges on white glass. Just turn the whole effect
           off; light-mode cards are clean frosted glass without
           reflections. */
        .light .v2-tasks-card-bg {
          display: none;
        }
        /* Light mode also kills the column's pulsing tone glow —
           --glow-alpha drops to 0 (so the radial gradients all
           collapse to transparent) and the pulse animation stops.
           Cards keep their dots (which still pulse) but nothing
           bleeds onto the column body. Clean light glass. */
        .light .v2-tasks-col[data-col="assigned"],
        .light .v2-tasks-col[data-col="wip"],
        .light .v2-tasks-col[data-col="review"] {
          --glow-alpha: 0;
        }
        .light .v2-tasks-col::before {
          animation: none;
        }
        .v2-tasks-col[data-col="assigned"] .v2-tasks-card .v2-tasks-card-bg { filter: url(#lit-glass-assigned); }
        .v2-tasks-col[data-col="wip"]      .v2-tasks-card .v2-tasks-card-bg { filter: url(#lit-glass-wip); }
        .v2-tasks-col[data-col="review"]   .v2-tasks-card .v2-tasks-card-bg { filter: url(#lit-glass-review); }

        /* Card content sits ABOVE the bg div so text stays crisp on
           top of the specular highlight. */
        .v2-tasks-card > .v2-tasks-card-head,
        .v2-tasks-card > .v2-tasks-card-title,
        .v2-tasks-card > .v2-tasks-card-foot {
          position: relative;
          z-index: 1;
        }
        @keyframes v2cardIn {
          to { opacity: 1; transform: none; }
        }
        .v2-tasks-col-body > .v2-tasks-card:nth-child(1) { animation-delay: 60ms; }
        .v2-tasks-col-body > .v2-tasks-card:nth-child(2) { animation-delay: 100ms; }
        .v2-tasks-col-body > .v2-tasks-card:nth-child(3) { animation-delay: 140ms; }
        .v2-tasks-col-body > .v2-tasks-card:nth-child(4) { animation-delay: 175ms; }
        .v2-tasks-col-body > .v2-tasks-card:nth-child(5) { animation-delay: 205ms; }
        .v2-tasks-col-body > .v2-tasks-card:nth-child(n+6) { animation-delay: 230ms; }

        .v2-tasks-card:hover {
          background:
            var(--glass-hover) padding-box,
            linear-gradient(135deg,
              rgba(var(--signature-rgb), 0.38) 0%,
              rgba(255, 255, 255, 0.10) 50%,
              rgba(var(--signature-rgb), 0.20) 100%) border-box;
          transform: translateY(-2px);
          box-shadow:
            0 14px 28px -16px rgba(0,0,0,0.55),
            0 0 0 1px rgba(var(--signature-rgb), 0.10),
            0 0 24px -4px rgba(var(--signature-rgb), 0.18);
        }
        .v2-tasks-card:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px rgba(var(--signature-rgb), 0.55),
            0 8px 22px -12px rgba(var(--signature-rgb), 0.45);
        }
        .v2-tasks-card:active { cursor: grabbing; }
        .v2-tasks-card.is-dragging {
          opacity: 0.55;
          transform: rotate(-1.5deg) scale(1.02);
          cursor: grabbing;
          box-shadow:
            0 22px 44px -18px rgba(0,0,0,0.7),
            0 0 0 1px rgba(var(--signature-rgb), 0.45);
        }
        /* Attention state — single quiet signal, not a full reskin.
           A 2px amber stripe on the left edge is the only deviation from
           the neutral glass card, so PROOF / HIGH chips don't collide with
           a matching border. */
        .v2-tasks-card.is-attn::before {
          content: '';
          position: absolute;
          left: 0; top: 10px; bottom: 10px;
          width: 2px;
          background: var(--warning);
          border-radius: 0 2px 2px 0;
          box-shadow: 0 0 8px rgba(255, 159, 10, 0.45);
        }
        .v2-tasks-card-head {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .v2-tasks-card-kind {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-tasks-card-prio {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 1px 6px;
          border: 1px solid;
          border-radius: 999px;
        }
        .v2-tasks-card-flag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--warning);
          padding: 0 0 0 9px;
          margin-left: 2px;
          position: relative;
          background: none;
          border: none;
        }
        .v2-tasks-card-flag::before {
          content: '';
          position: absolute;
          left: 0; top: 50%;
          transform: translateY(-50%);
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--warning);
          box-shadow: 0 0 6px var(--warning);
        }
        .v2-tasks-card-flag.is-reschedule {
          color: var(--signature);
        }
        .v2-tasks-card-flag.is-reschedule::before {
          background: var(--signature);
          box-shadow: 0 0 6px var(--signature);
        }
        .v2-tasks-card-title {
          font-size: 13.5px;
          font-weight: 600;
          line-height: 1.4;
          color: var(--txt-pure);
          margin: 0;
          letter-spacing: -0.005em;
          /* Cap title at 2 lines for scan-speed */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .v2-tasks-card-summary {
          font-size: 12px;
          line-height: 1.5;
          color: var(--txt-muted);
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .v2-tasks-card-foot {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 2px;
        }
        .v2-tasks-card-chip {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--txt-muted);
          padding: 2px 8px;
          border: 1px solid var(--rule);
          border-radius: 999px;
        }
        .v2-tasks-card-time {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
          margin-left: auto;
        }
        .v2-tasks-card-schedule {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          color: var(--signature);
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid rgba(var(--signature-rgb), 0.24);
          background: rgba(var(--signature-rgb), 0.06);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* Detail overlay */
        .v2-tasks-overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          /* Frosted veil, not a blackout — matches the shared modal scrim so
             the board stays readable behind the detail drawer. */
          background: var(--scrim);
          backdrop-filter: blur(10px) saturate(110%);
          -webkit-backdrop-filter: blur(10px) saturate(110%);
          display: flex;
          justify-content: flex-end;
          animation: v2overlayIn 200ms ease both;
        }
        @keyframes v2overlayIn { from { opacity: 0; } to { opacity: 1; } }
        .v2-tasks-detail {
          width: min(560px, 100%);
          height: 100%;
          background: var(--bg-deep, #0b0b0e);
          border-left: 1px solid var(--rule);
          padding: 28px 28px 32px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: v2detailSlide 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2detailSlide {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
        .v2-tasks-detail-close {
          position: absolute;
          top: 16px;
          right: 18px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 6px;
          width: 28px; height: 28px;
          color: var(--txt-faint);
          font-size: 16px;
          cursor: pointer;
          line-height: 1;
          transition: color 180ms ease, border-color 180ms ease;
        }
        .v2-tasks-detail-close:hover { color: var(--txt-pure); border-color: var(--rule-strong); }
        .v2-tasks-detail-head { display: flex; flex-direction: column; gap: 8px; }
        .v2-tasks-detail-kindrow {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .v2-tasks-detail-kind { color: var(--signature); margin: 0; }
        .v2-tasks-detail-title {
          font-size: 22px;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.015em;
          color: var(--txt-pure);
          margin: 0;
        }
        .v2-tasks-detail-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .v2-tasks-detail-chiprow {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .v2-tasks-detail-desc {
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--txt-muted);
          margin: 0;
        }
        .v2-tasks-detail-summary {
          padding: 10px 12px;
          background: rgba(var(--signature-rgb), 0.05);
          border-left: 2px solid rgba(var(--signature-rgb), 0.45);
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.6;
          color: var(--txt-pure);
          margin: 0;
        }
        .v2-tasks-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .v2-block-eye { display: block; margin: 0 0 6px; }

        /* Phase 3 / Plan 03 — Why you block in the task detail panel.
           Sits between the status chiprow and the description. Inherits the
           project's signature-pink accent on the left edge so the AI-PM
           reasoning is visually anchored without introducing a new aesthetic. */
        .v2-tasks-detail-whyyou {
          padding: 10px 12px;
          background: rgba(var(--signature-rgb), 0.05);
          border-left: 2px solid rgba(var(--signature-rgb), 0.45);
          border-radius: 4px;
        }
        .v2-tasks-detail-whyyou-sentence {
          font-size: 13px;
          line-height: 1.6;
          color: var(--txt-pure);
          margin: 0;
        }

        /* Buttons (mirror old inbox) */
        .v2-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          cursor: pointer;
          text-decoration: none;
          transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease, background 180ms ease, border-color 180ms ease, color 180ms ease;
          border: 1px solid;
        }
        .v2-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .v2-btn-primary {
          background: var(--signature);
          border-color: var(--signature);
          color: white;
        }
        .v2-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px -6px rgba(var(--signature-rgb), 0.55);
        }
        .v2-btn-ghost {
          background: transparent;
          border-color: var(--rule);
          color: var(--txt-muted);
        }
        .v2-btn-ghost:hover:not(:disabled) {
          color: var(--txt-pure);
          border-color: var(--rule-strong);
        }
        .v2-btn-warn {
          background: transparent;
          border-color: var(--warning);
          color: var(--warning);
        }
        .v2-btn-warn:hover:not(:disabled) {
          background: rgba(255, 159, 10, 0.08);
        }

        /* Reschedule */
        .v2-tasks-reschedule-note,
        .v2-tasks-reschedule-form {
          padding: 14px 16px;
          border: 1px dashed rgba(var(--signature-rgb), 0.30);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .v2-tasks-reschedule-window {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          color: var(--txt-pure);
          margin: 0;
          letter-spacing: 0.2px;
        }
        .v2-tasks-reschedule-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .v2-tasks-reschedule-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }
        .v2-tasks-reschedule-field span {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.9px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }

        /* Proof */
        .v2-tasks-proof {
          padding: 14px 16px;
          border: 1px dashed rgba(255, 159, 10, 0.30);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .v2-tasks-proof-hint {
          font-size: 13px;
          color: var(--txt-muted);
          margin: 0;
          line-height: 1.55;
        }
        .v2-tasks-proof-input {
          width: 100%;
          padding: 10px 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--rule);
          border-radius: 6px;
          color: var(--txt-pure);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.55;
          resize: vertical;
          outline: none;
        }
        .v2-tasks-proof-input::placeholder { color: var(--txt-faint); }
        .v2-tasks-proof-links { font-size: 12px; }
        .v2-tasks-proof-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .v2-tasks-proof-foot {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          margin: 0;
          line-height: 1.55;
          letter-spacing: 0.2px;
        }
        .v2-inline-spinner {
          width: 10px; height: 10px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.40);
          border-top-color: white;
          animation: v2spin 700ms linear infinite;
          display: inline-block;
          margin-right: 6px;
        }
        @keyframes v2spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* Light mode uses the SAME radial lighting recipe as dark mode —
           same alphas, same positions. We only override two things that
           don't translate from a dark surface to a light one:
           1. The ASSIGNED column's neutral card-edge color (white on
              white = invisible; flip to a dark neutral so the edge reads).
           2. The card cast shadow stack (dark mode's single hard shadow
              at -8px on dark backdrop becomes barely-visible on white;
              swap for an Apple-style 3-layer soft cast so cards lift
              off the column glass). */
        /* Light mode — kill the column glow entirely. Card-edge tint
           for assigned is kept (used by border gradients), but the
           radial-gradient glow alphas all collapse to 0 so the column
           body stays clean white. */
        .light .v2-tasks-col[data-col="assigned"] {
          --card-edge-rgb: 60, 60, 67;
          --glow-rgb: 90, 90, 105;
          --glow-alpha: 0;
        }
        .light .v2-tasks-col[data-col="wip"] {
          --glow-alpha: 0;
        }
        .light .v2-tasks-col[data-col="review"] {
          --glow-alpha: 0;
        }
        /* Light glass — frosted-white pane. Translucent enough that
           the internal glow reads, opaque enough to read as glass. */
        .light .v2-tasks-col {
          background:
            rgba(255, 255, 255, 0.62) padding-box,
            linear-gradient(135deg,
              rgba(255, 255, 255, 0.85) 0%,
              rgba(255, 255, 255, 0.40) 50%,
              rgba(255, 255, 255, 0.70) 100%) border-box;
          box-shadow:
            0 1px 0 rgba(0, 0, 0, 0.03),
            0 6px 16px -8px rgba(0, 0, 0, 0.07),
            0 24px 48px -16px rgba(0, 0, 0, 0.10),
            var(--edge-highlight),
            var(--edge-shadow);
        }
        .light .v2-tasks-card {
          box-shadow:
            0 1px 0 rgba(0, 0, 0, 0.04),
            0 4px 10px -4px rgba(0, 0, 0, 0.10),
            0 14px 28px -10px rgba(0, 0, 0, 0.10),
            var(--edge-highlight),
            var(--edge-shadow);
        }

        @media (max-width: 1024px) {
          .v2-tasks-board { grid-template-columns: 1fr; }
          .v2-tasks-col-body { max-height: none; }
        }
        @media (max-width: 640px) {
          .v2-tasks-detail { padding: 22px 18px 28px; }
        }
      `}</style>
    </div>
  );
}

export default function V2TasksPage() {
  return (
    <Suspense fallback={null}>
      <V2TasksInner />
    </Suspense>
  );
}

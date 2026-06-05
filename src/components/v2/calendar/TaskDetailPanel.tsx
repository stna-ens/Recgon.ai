'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProofDropZone } from '@/components/ProofDropZone';
import { TaskStatusChip } from '@/components/TaskStatusChip';
import type { AgentTask } from '@/lib/recgon/types';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ui';
import { daysOverdue, isOverdue } from '@/lib/recgon/overduePolicy';
import { OverdueChip } from './OverdueChip';

const KIND_KEYS = new Set(['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom']);

function cleanText(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*\*/g, '').replace(/__/g, '');
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function fmtRequestedDay(task: AgentTask): string | null {
  if (!task.rescheduleRequestedDate) return null;
  const d = new Date(`${task.rescheduleRequestedDate}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Phase 3 / Plan 03 — the API may decorate `AgentTask` with a pre-rendered
// `whyYouSentence` string for the assignee + team owner. The raw
// `assignmentReasoning` JSONB NEVER reaches the client (privacy boundary
// T-03-03-03 enforced server-side in /api/recgon/tasks/[id]).
type TaskWithWhyYou = AgentTask & { whyYouSentence?: string };

// Sub-component: renders the "WHY YOU" section ONLY when whyYouSentence is
// a non-empty string. No placeholder / empty header when the field is absent
// — keeps the panel clean for tasks without a reasoning envelope (legacy)
// and for viewers who aren't the assignee or owner (privacy filter).
function WhyYouBlock({ sentence }: { sentence?: string }) {
  const t = useTranslations('calendar');
  if (!sentence || typeof sentence !== 'string' || sentence.trim().length === 0) {
    return null;
  }
  return (
    <section className="cal-panel-section">
      <span className="cal-panel-section-eyebrow">{t('panel.whyYou')}</span>
      <p className="cal-panel-section-note">{sentence}</p>
    </section>
  );
}

// Phase 3.6 / Plan 04 — owner-only snooze control.
//
// Renders three preset chips (1d, 3d, 7d) + a custom integer input (1..30).
// POSTs to `/api/teams/[teamId]/tasks/[taskId]/snooze` with `{ days }`.
// On success, calls `onSnoozed()` so the parent panel can refresh + hide
// the OverdueChip immediately. On failure, surfaces a toast and leaves the
// chip in place so the user knows the snooze did not land.
//
// Caller is responsible for gating render on owner role + isOverdue —
// this sub-component assumes both are already true.
function SnoozeControl({
  taskId,
  teamId,
  onSnoozed,
  onError,
}: {
  taskId: string;
  teamId: string;
  onSnoozed: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations('calendar');
  const [working, setWorking] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDays, setCustomDays] = useState<string>('');

  const submit = useCallback(async (days: number) => {
    if (working) return;
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      onError(t('toast.snoozeRange'));
      return;
    }
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/snooze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('toast.snoozeFailed'));
      }
      onSnoozed();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('toast.snoozeFailed'));
    } finally {
      setWorking(false);
    }
  }, [working, taskId, teamId, onSnoozed, onError, t]);

  const submitCustom = useCallback(() => {
    const n = parseInt(customDays, 10);
    void submit(n);
  }, [customDays, submit]);

  return (
    <section className="cal-panel-section">
      <span className="cal-panel-section-eyebrow">{t('panel.snooze')}</span>
      <p className="cal-panel-section-note">
        {t('panel.snoozeNote')}
      </p>
      <div className="cal-panel-actions">
        <button
          type="button"
          className="cal-panel-btn"
          onClick={() => submit(1)}
          disabled={working}
          data-snooze="1"
        >{t('panel.snooze1Day')}</button>
        <button
          type="button"
          className="cal-panel-btn"
          onClick={() => submit(3)}
          disabled={working}
          data-snooze="3"
        >{t('panel.snooze3Days')}</button>
        <button
          type="button"
          className="cal-panel-btn"
          onClick={() => submit(7)}
          disabled={working}
          data-snooze="7"
        >{t('panel.snooze7Days')}</button>
        <button
          type="button"
          className="cal-panel-btn"
          onClick={() => setCustomOpen((v) => !v)}
          disabled={working}
          data-snooze="custom"
        >{t('panel.snoozeCustom')}</button>
      </div>
      {customOpen && (
        <div className="cal-panel-reschedule-form">
          <label className="cal-panel-field">
            <span className="cal-panel-field-label">{t('panel.snoozeDaysLabel')}</span>
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="cal-panel-input is-mono"
              placeholder={t('panel.snoozeDaysPlaceholder')}
              aria-label={t('panel.snoozeDaysAria')}
            />
          </label>
          <div className="cal-panel-actions cal-panel-actions-right">
            <button
              type="button"
              className="cal-panel-btn is-primary"
              onClick={submitCustom}
              disabled={working}
              data-snooze-submit="true"
            >{working ? t('panel.snoozing') : t('panel.snoozeAction')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

type Props = {
  task: TaskWithWhyYou | null;
  isOpen: boolean;
  // The teammate id that maps to the signed-in user in the current team.
  // null when the viewer has no teammate row (shouldn't happen in normal use)
  // or before teammates have loaded.
  currentTeammateId: string | null;
  // Whether the viewer is the team owner. Owners get owner-mode actions
  // (verify, reassign, cancel) on tasks they don't own.
  isOwner: boolean;
  onClose: () => void;
  onRefresh: () => void;
};

export function TaskDetailPanel({ task, isOpen, currentTeammateId, isOwner, onClose, onRefresh }: Props) {
  const t = useTranslations('calendar');
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [working, setWorking] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofLinks, setProofLinks] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [requestDate, setRequestDate] = useState('');

  useEffect(() => {
    setRequestOpen(false);
    setRequestNote(task?.rescheduleRequestNote ?? '');
    setRequestDate(toDateInput(task?.rescheduleRequestedDate ?? task?.scheduledDate));
  }, [task?.id, task?.rescheduleRequestedDate, task?.rescheduleRequestNote, task?.scheduledDate]);

  const act = useCallback(async (action: 'accept' | 'decline' | 'complete') => {
    if (!task || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('toast.actionFailed', { action }));
      }
      if (action === 'decline') {
        const { reassignedTo, ownerFallback } = await res.json().catch(() => ({}));
        addToast(ownerFallback ? t('toast.sentToOwner') : reassignedTo ? t('toast.reassigned') : t('toast.willReassign'), 'success');
      } else {
        addToast(action === 'accept' ? t('toast.accepted') : t('toast.sentForVerification'), 'success');
      }
      onRefresh();
      if (action !== 'accept') onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.actionFailed', { action }), 'error');
    } finally {
      setWorking(false);
    }
  }, [task, working, addToast, onRefresh, onClose, t]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!task || !files || files.length === 0) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/proof/upload`, { method: 'POST', body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || t('toast.uploadFailed')); }
      const { attachments: added } = (await res.json()) as { attachments: Array<{ name: string; url: string }> };
      setAttachments((prev) => [...prev, ...added]);
      addToast(t('toast.filesAttached', { count: added.length }), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.uploadFailed'), 'error');
    } finally { setUploadingFile(false); }
  }, [task, addToast, t]);

  const submitProof = useCallback(async () => {
    if (!task || working) return;
    const text = proofText.trim();
    const links = proofLinks.trim() ? proofLinks.trim().split(/\s+/).filter(Boolean) : [];
    if (!text && links.length === 0 && attachments.length === 0) {
      addToast(t('toast.proofMissing'), 'error'); return;
    }
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text || undefined, links: links.length ? links : undefined, attachments: attachments.length ? attachments : undefined, submittedAt: new Date().toISOString(), submittedBy: 'self' }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || t('toast.submitFailed')); }
      addToast(t('toast.proofSent'), 'success');
      setProofText(''); setProofLinks(''); setAttachments([]);
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.failed'), 'error');
    } finally { setWorking(false); }
  }, [task, working, proofText, proofLinks, attachments, addToast, onRefresh, t]);

  // Owner override — bypasses verification and marks complete. Used when a
  // task is awaiting review or stuck on proof and the owner wants to clear it.
  const overrideTask = useCallback(async () => {
    if (!task || working) return;
    if (!(await confirm({
      title: t('confirm.overrideTitle'),
      description: t('confirm.overrideBody'),
      destructive: true,
    }))) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/override`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || t('toast.overrideFailed')); }
      addToast(t('toast.overrideDone'), 'success');
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.overrideFailed'), 'error');
    } finally { setWorking(false); }
  }, [task, working, addToast, confirm, onRefresh, t]);

  // Owner reassign — uses the /decline endpoint which unassigns and
  // re-dispatches via Recgon's matcher.
  const reassignTask = useCallback(async () => {
    if (!task || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/decline`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || t('toast.reassignFailed')); }
      const { reassignedTo, ownerFallback } = await res.json().catch(() => ({}));
      addToast(
        ownerFallback ? t('toast.reassignNoMatch')
        : reassignedTo ? t('toast.reassigned')
        : t('toast.willReassign'),
        'success',
      );
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.reassignFailed'), 'error');
    } finally { setWorking(false); }
  }, [task, working, addToast, onRefresh, t]);

  // Owner cancel — keeps the task in history but stops execution.
  const cancelTask = useCallback(async () => {
    if (!task || working) return;
    if (!(await confirm({
      title: t('confirm.cancelTitle'),
      description: t('confirm.cancelBody'),
      confirmLabel: t('confirm.cancelConfirmLabel'),
      cancelLabel: t('confirm.keepTask'),
      destructive: true,
    }))) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || t('toast.cancelFailed')); }
      addToast(t('toast.cancelled'), 'success');
      onRefresh();
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.cancelFailed'), 'error');
    } finally { setWorking(false); }
  }, [task, working, addToast, confirm, onRefresh, onClose, t]);

  const submitRescheduleRequest = useCallback(async () => {
    if (!task || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/reschedule-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: requestNote.trim(),
          requestedDate: requestDate || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('toast.requestFailed'));
      }
      addToast(t('toast.requestSent'), 'success');
      setRequestOpen(false);
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toast.requestFailed'), 'error');
    } finally {
      setWorking(false);
    }
  }, [addToast, onRefresh, requestDate, requestNote, task, working, t]);

  const isAssigned = task?.status === 'assigned';
  const isInFlight = task?.status === 'accepted' || task?.status === 'in_progress';
  const needsProof = task?.verificationStatus === 'proof_requested' || task?.verificationStatus === 'failed';
  const hasPendingReschedule = task?.rescheduleRequestStatus === 'pending';
  // The viewer is the actual assignee — only they get accept / decline /
  // mark done / submit proof / request reschedule. Owners viewing other
  // people's tasks get the owner-mode block instead.
  const isAssignee = Boolean(
    task && currentTeammateId && task.assignedTo && task.assignedTo === currentTeammateId,
  );
  const isOwnerView = Boolean(isOwner && task && !isAssignee);
  const isTerminal = Boolean(
    task && ['completed', 'cancelled', 'declined', 'failed'].includes(task.status),
  );
  const canVerify = Boolean(
    task && (task.status === 'awaiting_review' || needsProof),
  );
  const canRequestReschedule = Boolean(
    isAssignee && task && !isTerminal,
  );

  return (
    <>
      <div className={`cal-panel-overlay${isOpen ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`cal-panel${isOpen ? ' is-open' : ''}`} aria-label={t('panel.aria')}>
        {!task ? null : (<>
        <div className="cal-panel-header">
          <div className="cal-panel-meta">
            <span className="cal-panel-kind">{KIND_KEYS.has(task.kind) ? t(`kind.${task.kind}`) : task.kind}</span>
            <span className="cal-panel-meta-sep" aria-hidden="true">·</span>
            <TaskStatusChip
              status={task.status as Parameters<typeof TaskStatusChip>[0]['status']}
              verification={task.verificationStatus}
              evidence={task.verificationEvidence ?? null}
            />
          </div>
          <button type="button" className="cal-panel-close" onClick={onClose} aria-label={t('panel.close')}>×</button>
        </div>

        <div className="cal-panel-body">
            <h3 className="cal-panel-title">{cleanText(task.title)}</h3>
            {task.description && <p className="cal-panel-desc">{cleanText(task.description)}</p>}

            {/* Phase 3 Plan 03 — assignee-only "Why you" line (CR-01 fix). */}
            <WhyYouBlock sentence={task.whyYouSentence} />

            {task.scheduledDate && (
              <section className="cal-panel-section">
                <span className="cal-panel-section-eyebrow">{t('panel.scheduled')}</span>
                <p className="cal-panel-section-text">
                  {new Date(`${task.scheduledDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  {task.scheduledUntilDate && task.scheduledUntilDate > task.scheduledDate && (
                    <>
                      {' → '}
                      {new Date(`${task.scheduledUntilDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </>
                  )}
                </p>
                {(() => {
                  // Phase 3.6 / Plan 04 — inline overdue chip alongside the
                  // scheduled date. Owners see tier-encoded color; assignees
                  // see uniform pink.
                  const today = new Date();
                  if (!isOverdue(task, today)) return null;
                  const endKey = task.scheduledUntilDate ?? task.scheduledDate;
                  if (!endKey) return null;
                  const days = Math.max(1, daysOverdue(endKey, today));
                  const tier = ((task.overdueTier ?? 0) as 0 | 1 | 2 | 3);
                  return (
                    <div className="cal-panel-overdue-row">
                      <OverdueChip tier={tier} days={days} ownerView={isOwner} />
                    </div>
                  );
                })()}
                {task.scheduleNote && <p className="cal-panel-section-note">{task.scheduleNote}</p>}
              </section>
            )}

            {(() => {
              // Phase 3.6 / Plan 04 — owner-only snooze control. Only render
              // when (a) viewer is owner, (b) task is currently overdue.
              // Non-owners (including the assignee) never see this; the
              // assignee uses "request reschedule" instead.
              const today = new Date();
              if (!isOwner) return null;
              if (!isOverdue(task, today)) return null;
              return (
                <SnoozeControl
                  taskId={task.id}
                  teamId={task.teamId}
                  onSnoozed={() => { addToast(t('toast.snoozed'), 'success'); onRefresh(); }}
                  onError={(msg) => addToast(msg, 'error')}
                />
              );
            })()}

            {hasPendingReschedule && (
              <section className="cal-panel-section is-reschedule">
                <span className="cal-panel-section-eyebrow is-reschedule">{t('panel.rescheduleRequested')}</span>
                {fmtRequestedDay(task) && (
                  <p className="cal-panel-section-text">{fmtRequestedDay(task)}</p>
                )}
                {task.rescheduleRequestNote && (
                  <p className="cal-panel-section-note">{task.rescheduleRequestNote}</p>
                )}
              </section>
            )}

            {isAssignee && (isAssigned || isInFlight) && (
              <section className="cal-panel-actions">
                {isAssigned && (
                  <>
                    <button type="button" className="cal-panel-btn is-primary" onClick={() => act('accept')} disabled={working}>
                      {working ? <><span className="cal-panel-spin" aria-hidden="true" />{t('actions.working')}</> : t('actions.accept')}
                    </button>
                    <button type="button" className="cal-panel-btn" onClick={() => act('decline')} disabled={working}>{t('actions.decline')}</button>
                  </>
                )}
                {isInFlight && !needsProof && (
                  <>
                    <button type="button" className="cal-panel-btn is-primary" onClick={() => act('complete')} disabled={working}>
                      {working ? <><span className="cal-panel-spin" aria-hidden="true" />{t('actions.working')}</> : t('actions.markDone')}
                    </button>
                    <button type="button" className="cal-panel-btn" onClick={() => act('decline')} disabled={working}>{t('actions.handBack')}</button>
                  </>
                )}
              </section>
            )}

            {isOwnerView && !isTerminal && (
              <section className="cal-panel-section">
                <span className="cal-panel-section-eyebrow">{t('panel.ownerActions')}</span>
                <p className="cal-panel-section-note">
                  {t('panel.ownerActionsNote')}
                </p>
                <div className="cal-panel-actions">
                  {canVerify && (
                    <button type="button" className="cal-panel-btn is-primary" onClick={overrideTask} disabled={working}>
                      {working ? <><span className="cal-panel-spin" aria-hidden="true" />{t('actions.working')}</> : t('actions.verify')}
                    </button>
                  )}
                  {task.assignedTo && (
                    <button type="button" className="cal-panel-btn" onClick={reassignTask} disabled={working}>
                      {t('actions.reassign')}
                    </button>
                  )}
                  <button type="button" className="cal-panel-btn" onClick={cancelTask} disabled={working}>
                    {t('actions.cancelTask')}
                  </button>
                </div>
              </section>
            )}

            {canRequestReschedule && (
              <section className="cal-panel-section">
                <div className="cal-panel-actions">
                  <button
                    type="button"
                    className={`cal-panel-btn ${hasPendingReschedule ? 'is-primary' : ''}`}
                    onClick={() => setRequestOpen((v) => !v)}
                    disabled={working}
                  >
                    {hasPendingReschedule ? t('actions.updateReschedule') : t('actions.requestReschedule')}
                  </button>
                </div>

                {requestOpen && (
                  <div className="cal-panel-reschedule-form">
                    <div className="cal-panel-time-grid">
                      <label className="cal-panel-field">
                        <span className="cal-panel-field-label">{t('panel.preferredDay')}</span>
                        <input
                          type="date"
                          value={requestDate}
                          onChange={(e) => setRequestDate(e.target.value)}
                          className="cal-panel-input is-mono"
                        />
                      </label>
                    </div>
                    <textarea
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder={t('panel.notePlaceholder')}
                      className="cal-panel-input"
                      rows={3}
                    />
                    <div className="cal-panel-actions cal-panel-actions-right">
                      <button
                        type="button"
                        className="cal-panel-btn is-primary"
                        onClick={submitRescheduleRequest}
                        disabled={working}
                      >
                        {working ? t('actions.sending') : t('actions.sendRequest')}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {needsProof && isAssignee && (
              <section className="cal-panel-section is-warn">
                <span className="cal-panel-section-eyebrow is-warn">{t('panel.proofNeeded')}</span>
                <p className="cal-panel-section-note">{t('panel.proofNeededNote')}</p>
                <textarea
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                  placeholder={t('panel.describePlaceholder')}
                  className="cal-panel-input"
                  rows={3}
                />
                <input
                  type="text"
                  value={proofLinks}
                  onChange={(e) => setProofLinks(e.target.value)}
                  placeholder={t('panel.linksPlaceholder')}
                  className="cal-panel-input is-mono"
                />
                <ProofDropZone
                  uploading={uploadingFile}
                  files={attachments}
                  onPick={handleUpload}
                  onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                />
                <p className="cal-panel-section-foot">{t('panel.proofFoot')}</p>
                <div className="cal-panel-actions cal-panel-actions-right">
                  <button type="button" className="cal-panel-btn is-warn" onClick={submitProof} disabled={working}>
                    {working ? t('actions.sending') : t('actions.submitProof')}
                  </button>
                </div>
              </section>
            )}
        </div>
        </>)}
      </aside>
      <style>{css}</style>
    </>
  );
}

const css = `
/* Transparent click-catcher only — the dim treatment is applied directly to
   the calendar outer (.week-cal-outer.is-panel-open) so the squircle shape
   is preserved instead of being overlaid by a sharp-cornered rectangle. */
.cal-panel-overlay {
  display: none;
  position: fixed; inset: 0;
  z-index: 49;
  background: transparent;
}
.cal-panel-overlay.is-open { display: block; }

.cal-panel {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: clamp(340px, 36vw, 520px);
  z-index: 50;
  background: var(--bg-card);
  border-left: 1px solid var(--rule);
  backdrop-filter: blur(48px) saturate(180%);
  -webkit-backdrop-filter: blur(48px) saturate(180%);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
}
.cal-panel.is-open { transform: translateX(0); }

.cal-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--rule);
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 2;
}
.cal-panel-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cal-panel-kind {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  color: var(--signature);
  text-transform: uppercase;
}
.cal-panel-meta-sep {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--txt-faint);
}
.cal-panel-close {
  background: transparent;
  border: none;
  color: var(--txt-faint);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 140ms ease;
}
.cal-panel-close:hover { color: var(--txt-pure); }
.cal-panel-close:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
  border-radius: 2px;
}

.cal-panel-body {
  padding: 24px 22px 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  flex: 1;
}
.cal-panel-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--txt-pure);
  letter-spacing: -0.01em;
  line-height: 1.3;
  margin: 0;
}
.cal-panel-desc {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--txt-muted);
  margin: -8px 0 0;
}

.cal-panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid var(--rule);
}
.cal-panel-section-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--signature);
  text-transform: uppercase;
}
.cal-panel-section-eyebrow.is-warn { color: var(--warning); }
.cal-panel-section-eyebrow.is-reschedule { color: var(--signature); }
.cal-panel-section.is-reschedule {
  border-color: rgba(var(--signature-rgb), 0.22);
}
.cal-panel-section-text {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: var(--txt-pure);
  letter-spacing: 0.2px;
  margin: 0;
  line-height: 1.5;
}
.cal-panel-section-note {
  font-size: 12.5px;
  color: var(--txt-muted);
  margin: 0;
  line-height: 1.55;
}
.cal-panel-section-foot {
  font-size: 11.5px;
  color: var(--txt-faint);
  margin: 0;
  line-height: 1.5;
  font-style: italic;
}
.cal-panel-overdue-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cal-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 6px;
}
.cal-panel-actions-right { justify-content: flex-end; padding-top: 4px; }

.cal-panel-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: 2px;
  cursor: pointer;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--txt-muted);
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}
.cal-panel-btn:hover:not(:disabled) {
  color: var(--txt-pure);
  border-color: var(--rule-strong);
}
.cal-panel-btn:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
}
.cal-panel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cal-panel-btn.is-primary {
  color: var(--signature);
  border-color: rgba(var(--signature-rgb), 0.35);
  background: rgba(var(--signature-rgb), 0.06);
}
.cal-panel-btn.is-primary:hover:not(:disabled) {
  background: rgba(var(--signature-rgb), 0.12);
  border-color: var(--signature);
}
.cal-panel-btn.is-warn {
  color: var(--warning);
  border-color: rgba(255,159,10,0.35);
  background: rgba(255,159,10,0.06);
}
.cal-panel-btn.is-warn:hover:not(:disabled) {
  background: rgba(255,159,10,0.12);
  border-color: var(--warning);
}
.cal-panel-spin {
  width: 9px; height: 9px; border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: calPanelSpin 700ms linear infinite;
  display: inline-block;
}
@keyframes calPanelSpin { to { transform: rotate(360deg); } }

.cal-panel-input {
  width: 100%;
  padding: 8px 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--rule);
  color: var(--txt-pure);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: border-color 160ms ease;
}
.cal-panel-input::placeholder { color: var(--txt-faint); font-style: italic; }
.cal-panel-input:focus { border-bottom-color: var(--signature); }
.cal-panel-input.is-mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  resize: none;
  letter-spacing: 0.2px;
}
.cal-panel-reschedule-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cal-panel-time-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.cal-panel-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cal-panel-field-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: var(--txt-faint);
}
@media (max-width: 520px) {
  .cal-panel { width: 100%; }
  .cal-panel-time-grid { grid-template-columns: 1fr; }
}
`;

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProofDropZone } from '@/components/ProofDropZone';
import { TaskStatusChip } from '@/components/TaskStatusChip';
import type { AgentTask } from '@/lib/recgon/types';
import { useToast } from '@/components/Toast';

const KIND_LABEL: Record<string, string> = {
  next_step: 'next step', dev_prompt: 'dev', marketing: 'marketing',
  analytics: 'analytics', research: 'research', custom: 'task',
};

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
  if (!sentence || typeof sentence !== 'string' || sentence.trim().length === 0) {
    return null;
  }
  return (
    <section className="cal-panel-section">
      <span className="cal-panel-section-eyebrow">WHY YOU</span>
      <p className="cal-panel-section-note">{sentence}</p>
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
  // Phase 3.5 / Plan 03.5-03 — optional owner-only action slot rendered
  // next to the SCHEDULED section. The owner workload board passes a
  // ReschedulePicker trigger; other callers leave the slot empty.
  ownerScheduledActions?: React.ReactNode;
};

export function TaskDetailPanel({ task, isOpen, currentTeammateId, isOwner, onClose, onRefresh, ownerScheduledActions }: Props) {
  const { addToast } = useToast();
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
        throw new Error(j.error || `${action} failed`);
      }
      if (action === 'decline') {
        const { reassignedTo, ownerFallback } = await res.json().catch(() => ({}));
        addToast(ownerFallback ? 'sent to team owner' : reassignedTo ? 'recgon reassigned' : 'recgon will reassign', 'success');
      } else {
        addToast(action === 'accept' ? 'accepted' : 'sent for verification', 'success');
      }
      onRefresh();
      if (action !== 'accept') onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : `${action} failed`, 'error');
    } finally {
      setWorking(false);
    }
  }, [task, working, addToast, onRefresh, onClose]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!task || !files || files.length === 0) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/proof/upload`, { method: 'POST', body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'upload failed'); }
      const { attachments: added } = (await res.json()) as { attachments: Array<{ name: string; url: string }> };
      setAttachments((prev) => [...prev, ...added]);
      addToast(`${added.length} file${added.length === 1 ? '' : 's'} attached`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'upload failed', 'error');
    } finally { setUploadingFile(false); }
  }, [task, addToast]);

  const submitProof = useCallback(async () => {
    if (!task || working) return;
    const text = proofText.trim();
    const links = proofLinks.trim() ? proofLinks.trim().split(/\s+/).filter(Boolean) : [];
    if (!text && links.length === 0 && attachments.length === 0) {
      addToast('add a note, a link, or a file before submitting', 'error'); return;
    }
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text || undefined, links: links.length ? links : undefined, attachments: attachments.length ? attachments : undefined, submittedAt: new Date().toISOString(), submittedBy: 'self' }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'submit failed'); }
      addToast('proof sent — recgon is re-checking', 'success');
      setProofText(''); setProofLinks(''); setAttachments([]);
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally { setWorking(false); }
  }, [task, working, proofText, proofLinks, attachments, addToast, onRefresh]);

  // Owner override — bypasses verification and marks complete. Used when a
  // task is awaiting review or stuck on proof and the owner wants to clear it.
  const overrideTask = useCallback(async () => {
    if (!task || working) return;
    if (!confirm('Mark this task complete and bypass verification?')) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/override`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'override failed'); }
      addToast('marked complete (override)', 'success');
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'override failed', 'error');
    } finally { setWorking(false); }
  }, [task, working, addToast, onRefresh]);

  // Owner reassign — uses the /decline endpoint which unassigns and
  // re-dispatches via Recgon's matcher.
  const reassignTask = useCallback(async () => {
    if (!task || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/decline`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'reassign failed'); }
      const { reassignedTo, ownerFallback } = await res.json().catch(() => ({}));
      addToast(
        ownerFallback ? 'no other match — sent to you'
        : reassignedTo ? 'recgon reassigned'
        : 'recgon will reassign',
        'success',
      );
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'reassign failed', 'error');
    } finally { setWorking(false); }
  }, [task, working, addToast, onRefresh]);

  // Owner cancel — keeps the task in history but stops execution.
  const cancelTask = useCallback(async () => {
    if (!task || working) return;
    if (!confirm('Cancel this task? It will be marked cancelled but kept for history.')) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'cancel failed'); }
      addToast('task cancelled', 'success');
      onRefresh();
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'cancel failed', 'error');
    } finally { setWorking(false); }
  }, [task, working, addToast, onRefresh, onClose]);

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
        throw new Error(j.error || 'request failed');
      }
      addToast('reschedule request sent', 'success');
      setRequestOpen(false);
      onRefresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'request failed', 'error');
    } finally {
      setWorking(false);
    }
  }, [addToast, onRefresh, requestDate, requestNote, task, working]);

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
      <aside className={`cal-panel${isOpen ? ' is-open' : ''}`} aria-label="Task detail">
        {!task ? null : (<>
        <div className="cal-panel-header">
          <div className="cal-panel-meta">
            <span className="cal-panel-kind">{KIND_LABEL[task.kind] ?? task.kind}</span>
            <span className="cal-panel-meta-sep" aria-hidden="true">·</span>
            <TaskStatusChip
              status={task.status as Parameters<typeof TaskStatusChip>[0]['status']}
              verification={task.verificationStatus}
              evidence={task.verificationEvidence ?? null}
            />
          </div>
          <button type="button" className="cal-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cal-panel-body">
            <h3 className="cal-panel-title">{cleanText(task.title)}</h3>
            {task.description && <p className="cal-panel-desc">{cleanText(task.description)}</p>}

            {/* Phase 3 Plan 03 — assignee-only "Why you" line (CR-01 fix). */}
            <WhyYouBlock sentence={task.whyYouSentence} />

            {task.scheduledDate && (
              <section className="cal-panel-section">
                <span className="cal-panel-section-eyebrow">SCHEDULED</span>
                <p className="cal-panel-section-text">
                  {new Date(`${task.scheduledDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  {task.scheduledUntilDate && task.scheduledUntilDate > task.scheduledDate && (
                    <>
                      {' → '}
                      {new Date(`${task.scheduledUntilDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </>
                  )}
                </p>
                {task.scheduleNote && <p className="cal-panel-section-note">{task.scheduleNote}</p>}
                {ownerScheduledActions && (
                  <div className="cal-panel-owner-actions">{ownerScheduledActions}</div>
                )}
              </section>
            )}

            {hasPendingReschedule && (
              <section className="cal-panel-section is-reschedule">
                <span className="cal-panel-section-eyebrow is-reschedule">RESCHEDULE REQUESTED</span>
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
                      {working ? <><span className="cal-panel-spin" aria-hidden="true" />working</> : 'accept'}
                    </button>
                    <button type="button" className="cal-panel-btn" onClick={() => act('decline')} disabled={working}>decline</button>
                  </>
                )}
                {isInFlight && !needsProof && (
                  <>
                    <button type="button" className="cal-panel-btn is-primary" onClick={() => act('complete')} disabled={working}>
                      {working ? <><span className="cal-panel-spin" aria-hidden="true" />working</> : 'mark done'}
                    </button>
                    <button type="button" className="cal-panel-btn" onClick={() => act('decline')} disabled={working}>hand back</button>
                  </>
                )}
              </section>
            )}

            {isOwnerView && !isTerminal && (
              <section className="cal-panel-section">
                <span className="cal-panel-section-eyebrow">OWNER ACTIONS</span>
                <p className="cal-panel-section-note">
                  The assignee handles accept / decline / mark done in their own inbox. From here you can intervene without acting on their behalf.
                </p>
                <div className="cal-panel-actions">
                  {canVerify && (
                    <button type="button" className="cal-panel-btn is-primary" onClick={overrideTask} disabled={working}>
                      {working ? <><span className="cal-panel-spin" aria-hidden="true" />working</> : 'verify'}
                    </button>
                  )}
                  {task.assignedTo && (
                    <button type="button" className="cal-panel-btn" onClick={reassignTask} disabled={working}>
                      reassign
                    </button>
                  )}
                  <button type="button" className="cal-panel-btn" onClick={cancelTask} disabled={working}>
                    cancel task
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
                    {hasPendingReschedule ? 'update reschedule' : 'request reschedule'}
                  </button>
                </div>

                {requestOpen && (
                  <div className="cal-panel-reschedule-form">
                    <div className="cal-panel-time-grid">
                      <label className="cal-panel-field">
                        <span className="cal-panel-field-label">preferred day</span>
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
                      placeholder="why this needs to move"
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
                        {working ? 'sending' : 'send request'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {needsProof && isAssignee && (
              <section className="cal-panel-section is-warn">
                <span className="cal-panel-section-eyebrow is-warn">PROOF NEEDED</span>
                <p className="cal-panel-section-note">Recgon couldn&apos;t auto-verify this. Drop a note, paste a link, or attach a file.</p>
                <textarea
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                  placeholder="describe what you did"
                  className="cal-panel-input"
                  rows={3}
                />
                <input
                  type="text"
                  value={proofLinks}
                  onChange={(e) => setProofLinks(e.target.value)}
                  placeholder="proof links (space-separated)"
                  className="cal-panel-input is-mono"
                />
                <ProofDropZone
                  uploading={uploadingFile}
                  files={attachments}
                  onPick={handleUpload}
                  onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                />
                <p className="cal-panel-section-foot">Recgon will fetch any URL you paste and judge the page itself.</p>
                <div className="cal-panel-actions cal-panel-actions-right">
                  <button type="button" className="cal-panel-btn is-warn" onClick={submitProof} disabled={working}>
                    {working ? 'sending' : 'submit proof'}
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

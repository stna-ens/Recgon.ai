'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { ProofDropZone } from '@/components/ProofDropZone';
import type { ProofPayload, VerificationEvidence, VerificationStatus } from '@/lib/recgon/types';

// V2 Verify — dedicated triage surface for tasks Recgon can't auto-verify.
// Lives at /verify. ATTENTION column on the home board (HomeBoard.tsx)
// deep-links here with ?filter=failed | awaiting | stuck.
//
// Data: GET /api/verify?teamId=… returns ALL triage-worthy tasks for the team
// (not just per-user assignments), with team role surfaced so the owner-only
// override action can gate cleanly.
//
// Per-card actions: POST /tasks/[id]/proof | /override | /decline.
// Polls every 4s while any task is mid-verification so the UI catches up
// when Recgon flips a status from auto_running → passed/failed.

interface VerifyTask {
  id: string;
  team_id: string;
  project_id: string | null;
  projectName: string | null;
  title: string;
  description: string;
  kind: string;
  source: string;
  priority: number;
  status: string;
  assigned_at: string;
  deadline: string | null;
  result: Record<string, unknown> | null;
  verification_status: VerificationStatus;
  verification_evidence: VerificationEvidence | null;
  assigned_to: string | null;
  proof: ProofPayload | null;
}

function fmtSubmittedAt(iso: string | undefined): string {
  if (!iso) return '';
  return relTime(iso);
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

function isImageAttachment(att: { name: string; url: string }): boolean {
  return IMAGE_EXT_RE.test(att.url) || IMAGE_EXT_RE.test(att.name);
}

interface VerifyResponse {
  tasks: VerifyTask[];
  role: 'owner' | 'member' | 'viewer';
  // Teammate row(s) the signed-in user owns inside this team. Used to gate
  // proof-submit + decline so on-behalf actions are impossible.
  currentTeammateIds: string[];
  counts: { total: number; failed: number; awaiting: number; stuck: number };
}

type FilterKey = 'all' | 'failed' | 'awaiting' | 'stuck';

const STUCK_HOURS = 24;

function bucketFor(t: VerifyTask): FilterKey | null {
  const vs = t.verification_status;
  if (vs === 'failed') return 'failed';
  if (vs === 'proof_requested' || vs === 'auto_inconclusive') return 'awaiting';
  if (vs === 'auto_running' || vs === 'proof_evaluating') {
    const ageMs = Date.now() - new Date(t.assigned_at).getTime();
    if (ageMs > STUCK_HOURS * 3_600_000) return 'stuck';
  }
  return null;
}

const FILTER_OPTIONS: { value: FilterKey; label: string; tone: 'crit' | 'warn' | 'info' | 'mute' }[] = [
  { value: 'all',      label: 'all',            tone: 'mute' },
  { value: 'failed',   label: 'failed',         tone: 'crit' },
  { value: 'awaiting', label: 'awaiting proof', tone: 'warn' },
  { value: 'stuck',    label: 'stuck',          tone: 'crit' },
];

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function cleanText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '');
}

function statusTone(vs: VerificationStatus | undefined): { tone: 'crit' | 'warn' | 'info' | 'mute'; label: string } {
  switch (vs) {
    case 'failed':            return { tone: 'crit',  label: 'recgon rejected' };
    case 'proof_requested':   return { tone: 'warn',  label: 'awaiting proof' };
    case 'auto_inconclusive': return { tone: 'warn',  label: 'inconclusive' };
    case 'proof_evaluating':  return { tone: 'info',  label: 'recgon re-checking' };
    case 'auto_running':      return { tone: 'info',  label: 'recgon checking' };
    default:                  return { tone: 'mute',  label: vs ?? 'unknown' };
  }
}

function filterTitle(filter: FilterKey, count: number): string {
  if (filter === 'failed') return `${count} failed ${count === 1 ? 'task' : 'tasks'}`;
  if (filter === 'awaiting') return `${count} awaiting proof`;
  if (filter === 'stuck') return `${count} stuck ${count === 1 ? 'task' : 'tasks'}`;
  return `${count} task${count === 1 ? '' : 's'} needing review`;
}

function filterHelp(filter: FilterKey): string {
  if (filter === 'failed') return 'Start here: compare the submitted proof with Recgon’s concern, then approve or decline.';
  if (filter === 'awaiting') return 'These need one more note, link, or file before Recgon can make a clean call.';
  if (filter === 'stuck') return 'These have been checking too long. Use owner override or decline to unblock the team.';
  return 'A focused queue for tasks where automatic verification needs a human decision.';
}

function taskActionLabel(t: VerifyTask): string {
  if (t.verification_status === 'failed') return 'Review proof';
  if (t.verification_status === 'proof_requested' || t.verification_status === 'auto_inconclusive') return 'Add proof';
  if (t.verification_status === 'auto_running' || t.verification_status === 'proof_evaluating') return 'Unblock';
  return 'Decide';
}

function V2VerifyInner() {
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [working, setWorking] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [proofState, setProofState] = useState<Record<string, {
    text: string;
    links: string;
    attachments: Array<{ name: string; url: string }>;
  }>>({});
  // Lightbox: when set, a fixed overlay shows the full-size image. Closed by
  // clicking the backdrop, pressing Esc, or clicking the close button.
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  // Esc-to-close for the lightbox.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while open so the page doesn't bleed through.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox]);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/verify?teamId=${teamId}`, { cache: 'no-store' });
      if (res.ok) {
        const j = (await res.json()) as VerifyResponse;
        setData(j);
      }
    } catch { /* swallow */ }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    const f = searchParams.get('filter') as FilterKey | null;
    if (f && FILTER_OPTIONS.some((o) => o.value === f)) setFilter(f);
  }, [searchParams]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live-update while AI is mid-verification.
  useEffect(() => {
    if (!data) return;
    const live = data.tasks.some(
      (t) => t.verification_status === 'auto_running' || t.verification_status === 'proof_evaluating',
    );
    if (!live) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [data, refresh]);

  const tasks = data?.tasks ?? [];
  const counts = data?.counts ?? { total: 0, failed: 0, awaiting: 0, stuck: 0 };
  const isOwner = data?.role === 'owner';
  const myTeammateIds = useMemo(
    () => new Set(data?.currentTeammateIds ?? []),
    [data?.currentTeammateIds],
  );
  const isAssigneeOf = useCallback(
    (t: VerifyTask) => Boolean(t.assigned_to && myTeammateIds.has(t.assigned_to)),
    [myTeammateIds],
  );

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => bucketFor(t) === filter);
  }, [tasks, filter]);

  // Headline tone — drives the cockpit ribbon color.
  const headTone: 'crit' | 'warn' | 'good' = (() => {
    if (counts.failed > 0 || counts.stuck > 0) return 'crit';
    if (counts.awaiting > 0) return 'warn';
    return 'good';
  })();

  const updateProofField = useCallback((id: string, patch: Partial<{ text: string; links: string; attachments: Array<{ name: string; url: string }> }>) => {
    setProofState((p) => {
      const current = p[id] ?? { text: '', links: '', attachments: [] };
      return {
        ...p,
        [id]: { ...current, ...patch },
      };
    });
  }, []);

  const handleUpload = useCallback(async (task: VerifyTask, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingId(task.id);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/proof/upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'upload failed');
      }
      const { attachments } = (await res.json()) as { attachments: Array<{ name: string; url: string }> };
      const existing = proofState[task.id]?.attachments ?? [];
      updateProofField(task.id, { attachments: [...existing, ...attachments] });
      addToast(`${attachments.length} file${attachments.length === 1 ? '' : 's'} attached`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'upload failed', 'error');
    } finally {
      setUploadingId(null);
    }
  }, [addToast, proofState, updateProofField]);

  const submitProof = useCallback(async (task: VerifyTask) => {
    if (working === task.id) return;
    const s = proofState[task.id];
    const text = (s?.text ?? '').trim();
    const linksRaw = (s?.links ?? '').trim();
    const links = linksRaw ? linksRaw.split(/\s+/).filter(Boolean) : [];
    const attachments = s?.attachments ?? [];
    if (!text && links.length === 0 && attachments.length === 0) {
      addToast('add a note, a link, or a file before submitting', 'error');
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
          attachments: attachments.length ? attachments : undefined,
          submittedAt: new Date().toISOString(),
          submittedBy: 'self',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'proof submit failed');
      }
      addToast('proof sent — recgon is re-checking', 'success');
      setProofState((p) => { const c = { ...p }; delete c[task.id]; return c; });
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, proofState, addToast, refresh]);

  const overrideTask = useCallback(async (task: VerifyTask) => {
    if (working === task.id) return;
    if (!confirm(`Mark "${task.title}" complete by owner override?\n\nThis bypasses Recgon's verification and is final.`)) return;
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'Owner override from /verify' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'override failed');
      }
      addToast('overridden — task marked complete', 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'override failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, refresh]);

  const declineTask = useCallback(async (task: VerifyTask) => {
    if (working === task.id) return;
    if (!confirm(`Decline "${task.title}"? It will be sent back to the routing queue.`)) return;
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.team_id}/tasks/${task.id}/decline`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'decline failed');
      }
      addToast('declined', 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'decline failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, refresh]);

  return (
    <div className="v2-vf">
      <div className="glass-card v2-vf-hero" data-tone={headTone}>
        <Link href="/" className="v2-vf-back">
          <ArrowLeft size={14} strokeWidth={2.2} />
          <span>back to home</span>
        </Link>

        <div className="v2-vf-hero-grid">
          <div className="v2-vf-hero-left">
            <div className="v2-vf-tag">
              <ShieldCheck size={14} strokeWidth={2.2} />
              <span>Verification queue</span>
            </div>
            <h1 className="v2-vf-headline">
              {loading ? '··'
                : counts.total === 0
                ? 'Nothing waiting on you.'
                : filterTitle(filter, visible.length)}
            </h1>
            <p className="v2-vf-sub">
              {filterHelp(filter)}
            </p>
          </div>

          <div className="v2-vf-hero-right">
            <div className="v2-vf-stat" data-tone="crit">
              <CircleAlert size={16} strokeWidth={2.2} />
              <div className="v2-vf-stat-num">{counts.failed}</div>
              <div className="v2-vf-stat-lab">failed</div>
            </div>
            <div className="v2-vf-stat" data-tone="warn">
              <UploadCloud size={16} strokeWidth={2.2} />
              <div className="v2-vf-stat-num">{counts.awaiting}</div>
              <div className="v2-vf-stat-lab">awaiting proof</div>
            </div>
            <div className="v2-vf-stat" data-tone="crit">
              <CircleDashed size={16} strokeWidth={2.2} />
              <div className="v2-vf-stat-num">{counts.stuck}</div>
              <div className="v2-vf-stat-lab">stuck &gt;{STUCK_HOURS}h</div>
            </div>
          </div>
        </div>

        {!loading && counts.total > 0 && (
          <div className="v2-vf-pills" role="tablist">
            {FILTER_OPTIONS.map((o) => {
              const n = o.value === 'all' ? counts.total : counts[o.value];
              return (
                <button
                  key={o.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === o.value}
                  className={`v2-vf-pill ${filter === o.value ? 'is-active' : ''}`}
                  data-tone={o.tone}
                  onClick={() => setFilter(o.value)}
                  disabled={n === 0 && o.value !== 'all'}
                >
                  <span className="v2-vf-pill-dot" />
                  <span className="v2-vf-pill-lab">{o.label}</span>
                  <span className="v2-vf-pill-num">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* LIST */}
      {loading ? (
        <ul className="v2-vf-list">
          {[0, 1, 2].map((i) => <li key={i} className="v2-vf-skel glass-card" />)}
        </ul>
      ) : visible.length === 0 ? (
        <div className="glass-card v2-vf-empty">
          <span className="v2-vf-empty-glyph" aria-hidden="true"><CheckCircle2 size={22} strokeWidth={2.2} /></span>
          <div className="v2-vf-empty-body">
            <p className="v2-vf-empty-title">
              {counts.total === 0
                ? "All clear."
                : `No ${filter} verifications.`}
            </p>
            <p className="v2-vf-empty-text">
              {counts.total === 0
                ? "Recgon is verifying every task on its own. You'll see anything that needs your call here."
                : "Try a different filter — or head back to the cockpit."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="v2-vf-list">
          {visible.map((t) => {
            const tone = statusTone(t.verification_status);
            const ev = t.verification_evidence;
            const proof = proofState[t.id];
            // Proof submission and decline are assignee-only — never on
            // someone else's behalf. The owner gets `mark complete`
            // (override) instead, and uses the calendar/list view for
            // reassignment.
            const isAssignee = isAssigneeOf(t);
            const canSubmitProof =
              isAssignee && (
                t.verification_status === 'proof_requested' ||
                t.verification_status === 'auto_inconclusive'
              );
            const isStuck = bucketFor(t) === 'stuck';
            const isFailed = t.verification_status === 'failed';
            const isLive =
              t.verification_status === 'auto_running' ||
              t.verification_status === 'proof_evaluating';
            const isWorking = working === t.id;
            const hasSubmittedProof = Boolean(
              t.proof &&
              ((t.proof.text && t.proof.text.trim()) ||
                (t.proof.links && t.proof.links.length > 0) ||
                (t.proof.attachments && t.proof.attachments.length > 0)),
            );
            const actionLabel = taskActionLabel(t);

            return (
              <li key={t.id} className="glass-card v2-vf-card" data-tone={tone.tone}>
                <span className="v2-vf-card-rib" aria-hidden="true" />

                <div className="v2-vf-card-grid">
                  <div className="v2-vf-card-main">
                    <header className="v2-vf-card-head">
                      <span className="v2-vf-status" data-tone={tone.tone}>
                        {isLive && <span className="v2-vf-live" aria-hidden="true" />}
                        {!isLive && <span className="v2-vf-status-dot" aria-hidden="true" />}
                        {tone.label}
                      </span>
                      {t.projectName && <span className="v2-vf-project">{t.projectName}</span>}
                      <span className="v2-vf-spacer" />
                      <span className="v2-vf-time">{relTime(t.assigned_at)}</span>
                    </header>

                    <h3 className="v2-vf-title">{cleanText(t.title)}</h3>

                    {(ev?.verdict || isStuck || isFailed) && (
                      <div className="v2-vf-verdict">
                        <div className="v2-vf-verdict-head">
                          <span className="v2-vf-verdict-tag">
                            {isFailed ? 'Recgon concern' : isStuck ? 'Why this is stuck' : 'Recgon said'}
                          </span>
                          {typeof ev?.confidence === 'number' && (
                            <span className="v2-vf-verdict-conf">
                              {Math.round(ev.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <p className="v2-vf-verdict-text">
                          {ev?.verdict
                            ? cleanText(ev.verdict)
                            : isStuck
                            ? `AI verification has been running for over ${STUCK_HOURS}h.`
                            : 'No verdict text recorded.'}
                        </p>
                      </div>
                    )}

                    {hasSubmittedProof && t.proof && (
                    <div className="v2-vf-submitted">
                      <div className="v2-vf-submitted-head">
                        <span className="v2-vf-submitted-tag">
                          submitted proof
                        </span>
                        <span className="v2-vf-submitted-meta">
                          {t.proof.submittedBy && t.proof.submittedBy !== 'self' && (
                            <>by {t.proof.submittedBy} · </>
                          )}
                          {fmtSubmittedAt(t.proof.submittedAt)}
                        </span>
                      </div>

                      {t.proof.text && t.proof.text.trim() && (
                        <p className="v2-vf-submitted-text">
                          {cleanText(t.proof.text)}
                        </p>
                      )}

                      {t.proof.links && t.proof.links.length > 0 && (
                        <ul className="v2-vf-submitted-links">
                          {t.proof.links.map((href, i) => (
                            <li key={i}>
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="v2-vf-submitted-link"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07l-1.06 1.06" />
                                  <path d="M14 11a5 5 0 0 0-7.07 0l-3.54 3.54a5 5 0 0 0 7.07 7.07l1.06-1.06" />
                                </svg>
                                <span>{href}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}

                      {t.proof.attachments && t.proof.attachments.length > 0 && (() => {
                        const images = t.proof.attachments.filter(isImageAttachment);
                        const files  = t.proof.attachments.filter((a) => !isImageAttachment(a));
                        return (
                          <>
                            {images.length > 0 && (
                              <ul className="v2-vf-submitted-imgs">
                                {images.map((att, i) => (
                                  <li key={`img-${i}`}>
                                    <button
                                      type="button"
                                      className="v2-vf-submitted-img"
                                      onClick={() => setLightbox({ url: att.url, name: att.name })}
                                      title={`Open ${att.name} full-size`}
                                      aria-label={`Open ${att.name} full-size`}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={att.url} alt={att.name} loading="lazy" />
                                      <span className="v2-vf-submitted-img-name">{att.name}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {files.length > 0 && (
                              <ul className="v2-vf-submitted-files">
                                {files.map((att, i) => (
                                  <li key={`file-${i}`}>
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="v2-vf-submitted-file"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                      </svg>
                                      <span>{att.name}</span>
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    )}

                    {(t.description || ev?.routedSource || (typeof ev?.iterations === 'number' && ev.iterations > 0)) && (
                      <details className="v2-vf-details">
                        <summary>
                          <span>Task details</span>
                          <ChevronDown size={14} strokeWidth={2.2} />
                        </summary>
                        {t.description && (
                          <p className="v2-vf-desc">{cleanText(t.description)}</p>
                        )}
                        {(ev?.routedSource || (typeof ev?.iterations === 'number' && ev.iterations > 0)) && (
                          <div className="v2-vf-verdict-meta">
                            {ev?.routedSource && <span>source: {ev.routedSource}</span>}
                            {typeof ev?.iterations === 'number' && ev.iterations > 0 && (
                              <span>iterations: {ev.iterations}</span>
                            )}
                          </div>
                        )}
                      </details>
                    )}
                  </div>

                  <div className="v2-vf-decision">
                    <div className="v2-vf-decision-head">
                      <span>{actionLabel}</span>
                      <small>
                        {isOwner
                          ? 'owner controls'
                          : isAssignee
                            ? 'your task'
                            : 'view-only'}
                      </small>
                    </div>

                    {canSubmitProof && (
                      <div className="v2-vf-proof">
                        <label className="v2-vf-field">
                          <span className="v2-vf-field-lab">short proof note</span>
                          <textarea
                            className="v2-vf-textarea"
                            rows={3}
                            placeholder="What changed, and where can Recgon see it?"
                            value={proof?.text ?? ''}
                            onChange={(e) => updateProofField(t.id, { text: e.target.value })}
                            disabled={isWorking}
                          />
                        </label>
                        <label className="v2-vf-field">
                          <span className="v2-vf-field-lab">links</span>
                          <input
                            type="text"
                            className="v2-vf-input"
                            placeholder="Paste one or more links"
                            value={proof?.links ?? ''}
                            onChange={(e) => updateProofField(t.id, { links: e.target.value })}
                            disabled={isWorking}
                          />
                        </label>
                        <ProofDropZone
                          uploading={uploadingId === t.id}
                          onPick={(files) => handleUpload(t, files)}
                          files={proof?.attachments ?? []}
                          onRemove={(idx) => {
                            const next = [...(proof?.attachments ?? [])];
                            next.splice(idx, 1);
                            updateProofField(t.id, { attachments: next });
                          }}
                        />
                      </div>
                    )}

                    <footer className="v2-vf-actions">
                      {canSubmitProof && (
                        <button
                          type="button"
                          className="v2-vf-btn v2-vf-btn-primary"
                          onClick={() => submitProof(t)}
                          disabled={isWorking}
                        >
                          <UploadCloud size={14} strokeWidth={2.2} />
                          {isWorking ? 'sending' : 'submit proof'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="v2-vf-btn v2-vf-btn-strong"
                        onClick={() => overrideTask(t)}
                        disabled={isWorking || !isOwner}
                        title={isOwner ? 'Mark complete by owner override' : 'Owner-only action'}
                      >
                        <CheckCircle2 size={14} strokeWidth={2.2} />
                        mark complete
                      </button>
                      {(isAssignee || isOwner) && (
                        <button
                          type="button"
                          className="v2-vf-btn v2-vf-btn-ghost"
                          onClick={() => declineTask(t)}
                          disabled={isWorking}
                          title={isAssignee ? 'Hand back — Recgon will reassign' : 'Reassign to another teammate'}
                        >
                          <XCircle size={14} strokeWidth={2.2} />
                          {isAssignee ? 'decline' : 'reassign'}
                        </button>
                      )}
                    </footer>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lightbox && typeof document !== 'undefined' && createPortal(
        <div
          className="v2-vf-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Full-size preview: ${lightbox.name}`}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="v2-vf-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            aria-label="Close preview"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="v2-vf-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="v2-vf-lightbox-caption" onClick={(e) => e.stopPropagation()}>
            <span>{lightbox.name}</span>
            <a href={lightbox.url} target="_blank" rel="noopener noreferrer" className="v2-vf-lightbox-open">
              open original
            </a>
          </div>
        </div>,
        document.body,
      )}

      <style>{stylesheet}</style>
    </div>
  );
}

export default function V2VerifyPage() {
  return (
    <Suspense fallback={<div className="v2-vf"><div className="v2-vf-skel glass-card" /></div>}>
      <V2VerifyInner />
    </Suspense>
  );
}

const stylesheet = `
  .v2-vf {
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: v2vfFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes v2vfFade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }

  /* ── HERO HEADER ─────────────────────────────────────────────────── */
  .v2-vf-hero.glass-card {
    position: relative;
    padding: 18px 22px 16px;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
  }
  .v2-vf-hero.glass-card:hover {
    transform: translateZ(0);
    box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
  }
  /* Tone-tinted top edge — at-a-glance "is the page hot?" */
  .v2-vf-hero::before {
    content: '';
    position: absolute;
    left: 0; right: 0; top: 0;
    height: 2px;
  }
  .v2-vf-hero[data-tone='good']::before { background: linear-gradient(90deg, transparent, var(--success, #059669), transparent); }
  .v2-vf-hero[data-tone='warn']::before { background: linear-gradient(90deg, transparent, var(--warning, #d97706), transparent); }
  .v2-vf-hero[data-tone='crit']::before { background: linear-gradient(90deg, transparent, var(--danger, #dc2626), transparent); }

  .v2-vf-back {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    color: var(--txt-faint);
    text-decoration: none;
    font-weight: 700;
    transition: color 180ms ease, gap 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .v2-vf-back:hover { color: var(--signature); gap: 10px; }
  .v2-vf-back:hover svg { transform: translateX(-2px); }
  .v2-vf-back svg { transition: transform 200ms ease; }

  .v2-vf-hero-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 24px;
    align-items: center;
  }
  @media (max-width: 880px) {
    .v2-vf-hero-grid { grid-template-columns: 1fr; }
  }

  .v2-vf-hero-left {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .v2-vf-tag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
    width: fit-content;
  }
  .v2-vf-hero[data-tone='good'] .v2-vf-tag { color: var(--success, #059669); }
  .v2-vf-hero[data-tone='warn'] .v2-vf-tag { color: var(--warning, #d97706); }
  .v2-vf-hero[data-tone='crit'] .v2-vf-tag { color: var(--danger, #dc2626); }

  .v2-vf-headline {
    margin: 0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: clamp(20px, 2.4vw, 28px);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.025em;
    color: var(--txt-pure);
  }
  .v2-vf-sub {
    margin: 0;
    font-size: 12.5px;
    color: var(--txt-muted);
    line-height: 1.5;
    max-width: 540px;
    letter-spacing: -0.005em;
  }

  .v2-vf-hero-right {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .v2-vf-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px;
    min-width: 76px;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.18);
  }
  .v2-vf-stat[data-tone='crit'] { border-color: rgba(220, 38, 38, 0.24); }
  .v2-vf-stat[data-tone='warn'] { border-color: rgba(217, 119, 6, 0.24); }
  .v2-vf-stat-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
    color: var(--txt-pure);
    font-variant-numeric: tabular-nums;
  }
  .v2-vf-stat[data-tone='crit'] .v2-vf-stat-num { color: var(--danger, #dc2626); }
  .v2-vf-stat[data-tone='warn'] .v2-vf-stat-num { color: var(--warning, #d97706); }
  .v2-vf-stat-lab {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 600;
    white-space: nowrap;
  }

  /* Filter pills row sits inside the hero so the page reads as one unit. */
  .v2-vf-pills {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid var(--rule);
    border-radius: 8px;
    width: fit-content;
  }
  .v2-vf-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: transparent;
    border: none;
    border-radius: 5px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    color: var(--txt-faint);
    cursor: pointer;
    font-weight: 700;
    transition: background 180ms ease, color 180ms ease;
  }
  .v2-vf-pill:hover:not(:disabled):not(.is-active) {
    color: var(--txt-muted);
    background: rgba(255, 255, 255, 0.03);
  }
  .v2-vf-pill.is-active {
    background: rgba(255, 255, 255, 0.06);
    color: var(--txt-pure);
  }
  .v2-vf-pill:disabled { opacity: 0.4; cursor: not-allowed; }
  .v2-vf-pill-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--txt-faint);
    flex-shrink: 0;
  }
  .v2-vf-pill[data-tone='crit'] .v2-vf-pill-dot { background: var(--danger, #dc2626); }
  .v2-vf-pill[data-tone='warn'] .v2-vf-pill-dot { background: var(--warning, #d97706); }
  .v2-vf-pill.is-active[data-tone='crit'] .v2-vf-pill-dot { box-shadow: 0 0 6px var(--danger, #dc2626); }
  .v2-vf-pill.is-active[data-tone='warn'] .v2-vf-pill-dot { box-shadow: 0 0 6px var(--warning, #d97706); }
  .v2-vf-pill-num {
    font-variant-numeric: tabular-nums;
    color: var(--txt-faint);
    font-weight: 600;
    opacity: 0.85;
  }
  .v2-vf-pill.is-active .v2-vf-pill-num { color: var(--txt-pure); opacity: 1; }

  /* ── CARD LIST ──────────────────────────────────────────────────── */
  .v2-vf-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .v2-vf-card.glass-card {
    position: relative;
    padding: 16px 18px 16px 22px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .v2-vf-card.glass-card:hover {
    transform: translateZ(0);
    box-shadow: var(--shadow-float), var(--edge-highlight), var(--edge-shadow);
  }
  .v2-vf-card-rib {
    position: absolute;
    left: 0; top: 14px; bottom: 14px;
    width: 3px;
    border-radius: 2px;
  }
  .v2-vf-card[data-tone='crit'] .v2-vf-card-rib { background: var(--danger, #dc2626); box-shadow: 0 0 10px rgba(220, 38, 38, 0.55); }
  .v2-vf-card[data-tone='warn'] .v2-vf-card-rib { background: var(--warning, #d97706); }
  .v2-vf-card[data-tone='info'] .v2-vf-card-rib { background: var(--signature); }
  .v2-vf-card[data-tone='mute'] .v2-vf-card-rib { background: var(--txt-faint); }

  .v2-vf-card-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .v2-vf-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--rule);
    color: var(--txt-muted);
  }
  .v2-vf-status[data-tone='crit'] { color: var(--danger, #dc2626); border-color: rgba(220, 38, 38, 0.32); background: rgba(220, 38, 38, 0.08); }
  .v2-vf-status[data-tone='warn'] { color: var(--warning, #d97706); border-color: rgba(217, 119, 6, 0.32); background: rgba(217, 119, 6, 0.08); }
  .v2-vf-status[data-tone='info'] { color: var(--signature); border-color: rgba(var(--signature-rgb), 0.32); background: rgba(var(--signature-rgb), 0.08); }
  .v2-vf-status-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 5px currentColor;
  }
  .v2-vf-live {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 5px currentColor;
    animation: v2vfPulse 1.4s ease-in-out infinite;
  }
  @keyframes v2vfPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(1.25); }
  }
  .v2-vf-project {
    color: var(--signature);
    opacity: 0.9;
  }
  .v2-vf-spacer { flex: 1; }
  .v2-vf-time {
    color: var(--txt-faint);
    font-weight: 500;
  }

  .v2-vf-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--txt-pure);
    line-height: 1.35;
    letter-spacing: -0.01em;
  }
  .v2-vf-desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--txt-muted);
    letter-spacing: -0.005em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .v2-vf-verdict {
    margin: 0;
    padding: 11px 13px;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid var(--rule);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .v2-vf-card[data-tone='crit'] .v2-vf-verdict { background: rgba(220, 38, 38, 0.05); border-color: rgba(220, 38, 38, 0.18); }
  .v2-vf-verdict-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .v2-vf-verdict-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-vf-card[data-tone='crit'] .v2-vf-verdict-tag { color: var(--danger, #dc2626); }
  .v2-vf-verdict-conf {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.4px;
    color: var(--txt-faint);
    font-variant-numeric: tabular-nums;
  }
  .v2-vf-verdict-text {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
  }
  .v2-vf-verdict-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.4px;
    color: var(--txt-faint);
    text-transform: uppercase;
  }

  /* What the assignee submitted (text/links/files), shown for review.
     Visually parallel to the AI-verdict box but neutrally tinted so the
     red verdict box still draws the eye to "why ai rejected it". */
  .v2-vf-submitted {
    margin: 0;
    padding: 11px 13px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--rule);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .v2-vf-submitted-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .v2-vf-submitted-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--txt-muted);
    font-weight: 700;
  }
  .v2-vf-submitted-meta {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.4px;
    color: var(--txt-faint);
    text-transform: uppercase;
  }
  .v2-vf-submitted-text {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .v2-vf-submitted-links,
  .v2-vf-submitted-files {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Image thumbnails — auto-fitted grid, click to open the lightbox. */
  .v2-vf-submitted-imgs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
  .v2-vf-submitted-img {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.32);
    overflow: hidden;
    cursor: zoom-in;
    transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 180ms ease, box-shadow 200ms ease;
  }
  .v2-vf-submitted-img:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--signature-rgb), 0.45);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
  }
  .v2-vf-submitted-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .v2-vf-submitted-img-name {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 6px 8px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
    color: var(--txt-pure);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.3px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(2px);
    transition: opacity 180ms ease, transform 180ms ease;
  }
  .v2-vf-submitted-img:hover .v2-vf-submitted-img-name,
  .v2-vf-submitted-img:focus-visible .v2-vf-submitted-img-name {
    opacity: 1;
    transform: translateY(0);
  }

  /* Lightbox — full-viewport overlay, click backdrop or Esc to close. */
  .v2-vf-lightbox {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.86);
    backdrop-filter: blur(8px) saturate(120%);
    -webkit-backdrop-filter: blur(8px) saturate(120%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 48px 24px 24px;
    cursor: zoom-out;
    animation: v2vfLbFade 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes v2vfLbFade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .v2-vf-lightbox-img {
    max-width: min(96vw, 1600px);
    max-height: 84vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    cursor: default;
    animation: v2vfLbZoom 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes v2vfLbZoom {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }
  .v2-vf-lightbox-close {
    position: absolute;
    top: 18px;
    right: 18px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--txt-pure);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: background 180ms ease, transform 180ms ease;
  }
  .v2-vf-lightbox-close:hover {
    background: rgba(255, 255, 255, 0.16);
    transform: scale(1.06);
  }
  .v2-vf-lightbox-caption {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.4px;
    color: var(--txt-pure);
    cursor: default;
  }
  .v2-vf-lightbox-open {
    color: var(--signature);
    text-decoration: none;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.6px;
  }
  .v2-vf-lightbox-open:hover { text-decoration: underline; }
  .v2-vf-submitted-link,
  .v2-vf-submitted-file {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 9px;
    border-radius: 5px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--txt-muted);
    text-decoration: none;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid var(--rule);
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
  }
  .v2-vf-submitted-link:hover,
  .v2-vf-submitted-file:hover {
    color: var(--signature);
    border-color: rgba(var(--signature-rgb), 0.32);
    background: rgba(var(--signature-rgb), 0.05);
  }
  .v2-vf-submitted-link span,
  .v2-vf-submitted-file span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v2-vf-submitted-link svg,
  .v2-vf-submitted-file svg {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .v2-vf-proof {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border: 1px dashed var(--rule);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
  }
  .v2-vf-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .v2-vf-field-lab {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-vf-textarea, .v2-vf-input {
    width: 100%;
    padding: 9px 11px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid var(--rule);
    border-radius: 6px;
    color: var(--txt-pure);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.45;
    resize: vertical;
    transition: border-color 180ms ease, background 180ms ease;
  }
  .v2-vf-textarea:focus, .v2-vf-input:focus {
    outline: none;
    border-color: rgba(var(--signature-rgb), 0.45);
    background: rgba(0, 0, 0, 0.36);
  }
  .v2-vf-textarea::placeholder, .v2-vf-input::placeholder {
    color: var(--txt-faint);
  }

  .v2-vf-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding-top: 4px;
  }
  .v2-vf-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    font-weight: 700;
    cursor: pointer;
    transition: background 180ms ease, border-color 180ms ease, color 180ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease;
  }
  .v2-vf-btn:disabled { opacity: 0.42; cursor: not-allowed; }
  .v2-vf-btn-primary {
    background: var(--signature);
    color: white;
    border: 1px solid var(--signature);
  }
  .v2-vf-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(var(--signature-rgb), 0.36);
  }
  .v2-vf-btn-strong {
    background: rgba(220, 38, 38, 0.08);
    color: var(--danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.32);
  }
  .v2-vf-btn-strong:hover:not(:disabled) {
    background: rgba(220, 38, 38, 0.16);
    border-color: rgba(220, 38, 38, 0.55);
    transform: translateY(-1px);
  }
  .v2-vf-btn-ghost {
    background: transparent;
    color: var(--txt-muted);
    border: 1px solid var(--rule);
  }
  .v2-vf-btn-ghost:hover:not(:disabled) {
    color: var(--txt-pure);
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.04);
  }

  /* ── EMPTY + SKELETON ───────────────────────────────────────────── */
  .v2-vf-empty {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 26px 28px;
    border-radius: 12px;
  }
  .v2-vf-empty-glyph {
    width: 38px; height: 38px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(16, 185, 129, 0.12);
    color: var(--success, #059669);
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.3), 0 6px 18px rgba(16, 185, 129, 0.14);
  }
  .v2-vf-empty-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .v2-vf-empty-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--txt-pure);
    letter-spacing: -0.01em;
  }
  .v2-vf-empty-text {
    margin: 0;
    font-size: 12.5px;
    color: var(--txt-muted);
    line-height: 1.5;
    max-width: 540px;
  }

  .v2-vf-skel {
    height: 132px;
    border-radius: 12px;
    animation: v2vfSkel 1.6s ease-in-out infinite;
  }
  @keyframes v2vfSkel {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 0.85; }
  }

  /* Calm triage refresh */
  .v2-vf {
    gap: 12px;
    max-width: 1180px;
    margin: 0 auto;
  }
  .v2-vf-hero.glass-card {
    padding: 16px;
    border-radius: 10px;
    gap: 14px;
  }
  .v2-vf-hero::before {
    height: 1px;
    opacity: 0.8;
  }
  .v2-vf-hero-grid {
    gap: 18px;
  }
  .v2-vf-headline {
    font-family: inherit;
    font-size: 24px;
    line-height: 1.18;
    letter-spacing: 0;
  }
  .v2-vf-sub {
    max-width: 620px;
    font-size: 13px;
    letter-spacing: 0;
  }
  .v2-vf-tag,
  .v2-vf-back,
  .v2-vf-card-head,
  .v2-vf-status,
  .v2-vf-project,
  .v2-vf-time,
  .v2-vf-verdict-tag,
  .v2-vf-verdict-conf,
  .v2-vf-submitted-tag,
  .v2-vf-submitted-meta,
  .v2-vf-field-lab,
  .v2-vf-pill,
  .v2-vf-stat-lab,
  .v2-vf-btn,
  .v2-vf-details summary,
  .v2-vf-decision-head {
    letter-spacing: 0;
  }
  .v2-vf-tag {
    color: var(--txt-muted) !important;
    text-transform: none;
    font-size: 12px;
  }
  .v2-vf-hero-right {
    display: grid;
    grid-template-columns: repeat(3, minmax(92px, 1fr));
    min-width: 328px;
  }
  .v2-vf-stat {
    min-width: 0;
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.025);
  }
  .v2-vf-stat svg {
    color: var(--txt-faint);
  }
  .v2-vf-stat-num {
    font-size: 19px;
    letter-spacing: 0;
  }
  .v2-vf-stat-lab {
    white-space: normal;
    line-height: 1.2;
    text-transform: none;
  }
  .v2-vf-pills {
    width: 100%;
    background: rgba(255, 255, 255, 0.025);
    border-radius: 8px;
  }
  .v2-vf-pill {
    flex: 1 1 130px;
    justify-content: center;
    min-height: 34px;
    text-transform: none;
  }
  .v2-vf-pill-dot {
    display: none;
  }
  .v2-vf-card.glass-card {
    padding: 0;
    border-radius: 10px;
    overflow: hidden;
  }
  .v2-vf-card-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
    gap: 0;
  }
  .v2-vf-card-main {
    min-width: 0;
    padding: 16px 18px 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .v2-vf-decision {
    border-left: 1px solid var(--rule);
    background: rgba(255, 255, 255, 0.018);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .v2-vf-decision-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--txt-pure);
    text-transform: uppercase;
  }
  .v2-vf-decision-head small {
    color: var(--txt-faint);
    font-size: 10px;
    font-weight: 600;
    text-transform: none;
  }
  .v2-vf-title {
    font-size: 16px;
    line-height: 1.35;
    letter-spacing: 0;
  }
  .v2-vf-desc,
  .v2-vf-verdict-text,
  .v2-vf-submitted-text {
    letter-spacing: 0;
  }
  .v2-vf-verdict,
  .v2-vf-submitted,
  .v2-vf-proof {
    border-radius: 8px;
  }
  .v2-vf-verdict {
    background: rgba(255, 255, 255, 0.028);
  }
  .v2-vf-card[data-tone='crit'] .v2-vf-verdict {
    background: rgba(220, 38, 38, 0.055);
    border-color: rgba(220, 38, 38, 0.2);
  }
  .v2-vf-verdict-head,
  .v2-vf-submitted-head {
    align-items: flex-start;
  }
  .v2-vf-verdict-conf {
    text-transform: none;
  }
  .v2-vf-submitted-imgs {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  }
  .v2-vf-details {
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.018);
  }
  .v2-vf-details summary {
    cursor: pointer;
    list-style: none;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--txt-muted);
  }
  .v2-vf-details summary::-webkit-details-marker {
    display: none;
  }
  .v2-vf-details[open] summary svg {
    transform: rotate(180deg);
  }
  .v2-vf-details summary svg {
    transition: transform 160ms ease;
  }
  .v2-vf-details .v2-vf-desc,
  .v2-vf-details .v2-vf-verdict-meta {
    padding: 0 12px 12px;
  }
  .v2-vf-proof {
    padding: 0;
    border: none;
    background: transparent;
  }
  .v2-vf-textarea,
  .v2-vf-input {
    background: rgba(0, 0, 0, 0.2);
  }
  .v2-vf-actions {
    padding-top: 0;
    flex-direction: column;
    align-items: stretch;
  }
  .v2-vf-btn {
    width: 100%;
    justify-content: center;
    min-height: 38px;
    border-radius: 7px;
    text-transform: none;
  }
  .v2-vf-btn-strong {
    background: rgba(16, 185, 129, 0.1);
    color: var(--success, #059669);
    border-color: rgba(16, 185, 129, 0.28);
  }
  .v2-vf-btn-strong:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.46);
  }
  @media (max-width: 920px) {
    .v2-vf-hero-right {
      min-width: 0;
    }
    .v2-vf-card-grid {
      grid-template-columns: 1fr;
    }
    .v2-vf-decision {
      border-left: none;
      border-top: 1px solid var(--rule);
    }
  }
  @media (max-width: 640px) {
    .v2-vf-hero.glass-card,
    .v2-vf-card-main,
    .v2-vf-decision {
      padding: 14px;
    }
    .v2-vf-hero-right {
      grid-template-columns: 1fr;
    }
    .v2-vf-headline {
      font-size: 21px;
    }
    .v2-vf-submitted-head,
    .v2-vf-verdict-head {
      flex-direction: column;
      gap: 4px;
    }
  }
`;

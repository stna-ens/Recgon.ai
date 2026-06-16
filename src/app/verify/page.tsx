'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { relTimeParts } from '@/lib/datetime';
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Button, useConfirm, Skeleton } from '@/components/ui';
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

type Translator = ReturnType<typeof useTranslations<'verify'>>;

function fmtSubmittedAt(iso: string | undefined, t: Translator): string {
  if (!iso) return '';
  return relTime(iso, t);
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

const FILTER_OPTIONS: { value: FilterKey; tone: 'crit' | 'warn' | 'info' | 'mute' }[] = [
  { value: 'all',      tone: 'mute' },
  { value: 'failed',   tone: 'crit' },
  { value: 'awaiting', tone: 'warn' },
  { value: 'stuck',    tone: 'crit' },
];

function filterLabel(value: FilterKey, t: Translator): string {
  return t(`filters.${value}`);
}

function relTime(iso: string | null, t: Translator): string {
  const p = relTimeParts(iso);
  if (!p) return '';
  if (p.unit === 'justNow') return t('time.justNow');
  return t(`time.${p.unit}Ago`, { count: p.count });
}

function cleanText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '');
}

function statusTone(vs: VerificationStatus | undefined, t: Translator): { tone: 'crit' | 'warn' | 'info' | 'mute'; label: string } {
  switch (vs) {
    case 'failed':            return { tone: 'crit',  label: t('status.rejected') };
    case 'proof_requested':   return { tone: 'warn',  label: t('status.awaitingProof') };
    case 'auto_inconclusive': return { tone: 'warn',  label: t('status.inconclusive') };
    case 'proof_evaluating':  return { tone: 'info',  label: t('status.reChecking') };
    case 'auto_running':      return { tone: 'info',  label: t('status.checking') };
    default:                  return { tone: 'mute',  label: vs ?? t('status.unknown') };
  }
}

function filterTitle(filter: FilterKey, count: number, t: Translator): string {
  if (filter === 'failed') return t('titles.failed', { count });
  if (filter === 'awaiting') return t('titles.awaiting', { count });
  if (filter === 'stuck') return t('titles.stuck', { count });
  return t('titles.review', { count });
}

function filterHelp(filter: FilterKey, t: Translator): string {
  if (filter === 'failed') return t('help.failed');
  if (filter === 'awaiting') return t('help.awaiting');
  if (filter === 'stuck') return t('help.stuck');
  return t('help.default');
}

function taskActionLabel(task: VerifyTask, t: Translator): string {
  if (task.verification_status === 'failed') return t('actionLabel.reviewProof');
  if (task.verification_status === 'proof_requested' || task.verification_status === 'auto_inconclusive') return t('actionLabel.addProof');
  if (task.verification_status === 'auto_running' || task.verification_status === 'proof_evaluating') return t('actionLabel.unblock');
  return t('actionLabel.decide');
}

function V2VerifyInner() {
  const t = useTranslations('verify');
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const { addToast } = useToast();
  const confirmDialog = useConfirm();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Fetch failure must NEVER render as "all clear" — track it explicitly so
  // the page can show a designed error card with retry (C-03).
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Keep the active filter in the URL so refresh and deep-links preserve it.
  const selectFilter = useCallback((f: FilterKey) => {
    setFilter(f);
    router.replace(f === 'all' ? '/verify' : `/verify?filter=${f}`, { scroll: false });
  }, [router]);
  const [working, setWorking] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [proofState, setProofState] = useState<Record<string, {
    text: string;
    links: string;
    attachments: Array<{ name: string; url: string }>;
  }>>({});
  // Lightbox: when set, a Radix Dialog shows the full-size image. Radix
  // supplies Esc-to-close, scroll lock, focus trap and focus restore (C-06).
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/verify?teamId=${teamId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`verify fetch failed: ${res.status}`);
      const j = (await res.json()) as VerifyResponse;
      setData(j);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
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

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
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

  // True only while we have nothing to show AND the fetch failed — a stale
  // cached payload still renders normally while retries happen in background.
  const loadFailed = loadError && !data;

  // Headline tone — drives the cockpit ribbon color.
  const headTone: 'crit' | 'warn' | 'good' = (() => {
    if (loadFailed) return 'crit';
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
      addToast(t('toasts.filesAttached', { count: attachments.length }), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.uploadFailed'), 'error');
    } finally {
      setUploadingId(null);
    }
  }, [addToast, proofState, updateProofField, t]);

  const submitProof = useCallback(async (task: VerifyTask) => {
    if (working === task.id) return;
    const s = proofState[task.id];
    const text = (s?.text ?? '').trim();
    const linksRaw = (s?.links ?? '').trim();
    const links = linksRaw ? linksRaw.split(/\s+/).filter(Boolean) : [];
    const attachments = s?.attachments ?? [];
    if (!text && links.length === 0 && attachments.length === 0) {
      addToast(t('toasts.proofRequired'), 'error');
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
      addToast(t('toasts.proofSent'), 'success');
      setProofState((p) => { const c = { ...p }; delete c[task.id]; return c; });
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.failed'), 'error');
    } finally {
      setWorking(null);
    }
  }, [working, proofState, addToast, refresh, t]);

  const overrideTask = useCallback(async (task: VerifyTask) => {
    if (working === task.id) return;
    if (!(await confirmDialog({
      title: t('confirm.overrideTitle', { title: task.title }),
      description: t('confirm.overrideBody'),
      destructive: true,
    }))) return;
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
      addToast(t('toasts.overridden'), 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.overrideFailed'), 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, confirmDialog, refresh, t]);

  const declineTask = useCallback(async (task: VerifyTask) => {
    if (working === task.id) return;
    if (!(await confirmDialog({
      title: t('confirm.declineTitle', { title: task.title }),
      description: t('confirm.declineBody'),
      destructive: true,
    }))) return;
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
      addToast(t('toasts.declined'), 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.declineFailed'), 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, confirmDialog, refresh, t]);

  return (
    <div className="v2-vf">
      <div className="glass-card v2-vf-hero" data-tone={headTone}>
        <Link href="/" className="v2-vf-back">
          <ArrowLeft size={14} strokeWidth={2.2} />
          <span>{t('backToHome')}</span>
        </Link>

        <div className="v2-vf-hero-grid">
          <div className="v2-vf-hero-left">
            <div className="v2-vf-tag">
              <ShieldCheck size={14} strokeWidth={2.2} />
              <span>{t('queueTag')}</span>
            </div>
            <h1 className="v2-vf-headline">
              {loading ? '··'
                : loadFailed
                ? t('error.headline')
                : counts.total === 0
                ? t('nothingWaiting')
                : filterTitle(filter, visible.length, t)}
            </h1>
            <p className="v2-vf-sub">
              {loadFailed ? t('error.sub') : filterHelp(filter, t)}
            </p>
          </div>

          {!loadFailed && (
          <div className="v2-vf-hero-right">
            <div className="v2-vf-stat" data-tone="crit">
              <CircleAlert size={16} strokeWidth={2.2} />
              <div className="v2-vf-stat-num">{counts.failed}</div>
              <div className="v2-vf-stat-lab">{t('stats.failed')}</div>
            </div>
            <div className="v2-vf-stat" data-tone="warn">
              <UploadCloud size={16} strokeWidth={2.2} />
              <div className="v2-vf-stat-num">{counts.awaiting}</div>
              <div className="v2-vf-stat-lab">{t('stats.awaitingProof')}</div>
            </div>
            <div className="v2-vf-stat" data-tone="crit">
              <CircleDashed size={16} strokeWidth={2.2} />
              <div className="v2-vf-stat-num">{counts.stuck}</div>
              <div className="v2-vf-stat-lab">{t('stats.stuck', { hours: STUCK_HOURS })}</div>
            </div>
          </div>
          )}
        </div>

        {/* Toggle buttons, not tabs — they filter a list in place, so
            aria-pressed is the correct pattern (matches /tasks). */}
        {!loading && counts.total > 0 && (
          <div className="v2-vf-pills">
            {FILTER_OPTIONS.map((o) => {
              const n = o.value === 'all' ? counts.total : counts[o.value];
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={filter === o.value}
                  className={`v2-vf-pill ${filter === o.value ? 'is-active' : ''}`}
                  data-tone={o.tone}
                  onClick={() => selectFilter(o.value)}
                  disabled={n === 0 && o.value !== 'all'}
                >
                  <span className="v2-vf-pill-lab">{filterLabel(o.value, t)}</span>
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
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton width="100%" height={132} radius={12} />
            </li>
          ))}
        </ul>
      ) : loadFailed ? (
        <div className="glass-card v2-vf-empty is-error" role="alert">
          <span className="v2-vf-empty-glyph is-error" aria-hidden="true"><CircleAlert size={22} strokeWidth={2.2} /></span>
          <div className="v2-vf-empty-body">
            <p className="v2-vf-empty-title">{t('error.title')}</p>
            <p className="v2-vf-empty-text">{t('error.text')}</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="v2-vf-empty-retry"
            onClick={() => { setLoading(true); void refresh(); }}
          >{t('error.retry')}</Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card v2-vf-empty">
          <span className="v2-vf-empty-glyph" aria-hidden="true"><CheckCircle2 size={22} strokeWidth={2.2} /></span>
          <div className="v2-vf-empty-body">
            <p className="v2-vf-empty-title">
              {counts.total === 0
                ? t('empty.allClearTitle')
                : t('empty.noFilterTitle', { filter: filterLabel(filter, t) })}
            </p>
            <p className="v2-vf-empty-text">
              {counts.total === 0
                ? t('empty.allClearText')
                : t('empty.noFilterText')}
            </p>
          </div>
        </div>
      ) : (
        <ul className="v2-vf-list">
          {visible.map((task) => {
            const tone = statusTone(task.verification_status, t);
            const ev = task.verification_evidence;
            const proof = proofState[task.id];
            // Proof submission and decline are assignee-only — never on
            // someone else's behalf. The owner gets `mark complete`
            // (override) instead, and uses the calendar/list view for
            // reassignment.
            const isAssignee = isAssigneeOf(task);
            const canSubmitProof =
              isAssignee && (
                task.verification_status === 'proof_requested' ||
                task.verification_status === 'auto_inconclusive'
              );
            const isStuck = bucketFor(task) === 'stuck';
            const isFailed = task.verification_status === 'failed';
            const isLive =
              task.verification_status === 'auto_running' ||
              task.verification_status === 'proof_evaluating';
            const isWorking = working === task.id;
            const hasSubmittedProof = Boolean(
              task.proof &&
              ((task.proof.text && task.proof.text.trim()) ||
                (task.proof.links && task.proof.links.length > 0) ||
                (task.proof.attachments && task.proof.attachments.length > 0)),
            );
            const actionLabel = taskActionLabel(task, t);

            return (
              <li key={task.id} className="glass-card v2-vf-card" data-tone={tone.tone}>
                <span className="v2-vf-card-rib" aria-hidden="true" />

                <div className="v2-vf-card-grid">
                  <div className="v2-vf-card-main">
                    <header className="v2-vf-card-head">
                      <span className="v2-vf-status" data-tone={tone.tone}>
                        {isLive && <span className="v2-vf-live" aria-hidden="true" />}
                        {!isLive && <span className="v2-vf-status-dot" aria-hidden="true" />}
                        {tone.label}
                      </span>
                      {task.projectName && <span className="v2-vf-project">{task.projectName}</span>}
                      <span className="v2-vf-spacer" />
                      <span className="v2-vf-time">{relTime(task.assigned_at, t)}</span>
                    </header>

                    <h3 className="v2-vf-title">{cleanText(task.title)}</h3>

                    {(ev?.verdict || isStuck || isFailed) && (
                      <div className="v2-vf-verdict">
                        <div className="v2-vf-verdict-head">
                          <span className="v2-vf-verdict-tag">
                            {isFailed ? t('verdict.concern') : isStuck ? t('verdict.whyStuck') : t('verdict.recgonSaid')}
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
                            ? t('verdict.stuckText', { hours: STUCK_HOURS })
                            : t('verdict.noVerdict')}
                        </p>
                      </div>
                    )}

                    {hasSubmittedProof && task.proof && (
                    <div className="v2-vf-submitted">
                      <div className="v2-vf-submitted-head">
                        <span className="v2-vf-submitted-tag">
                          {t('submittedProof')}
                        </span>
                        <span className="v2-vf-submitted-meta">
                          {task.proof.submittedBy && task.proof.submittedBy !== 'self' && (
                            <>{t('byUser', { user: task.proof.submittedBy })} · </>
                          )}
                          {fmtSubmittedAt(task.proof.submittedAt, t)}
                        </span>
                      </div>

                      {task.proof.text && task.proof.text.trim() && (
                        <p className="v2-vf-submitted-text">
                          {cleanText(task.proof.text)}
                        </p>
                      )}

                      {task.proof.links && task.proof.links.length > 0 && (
                        <ul className="v2-vf-submitted-links">
                          {task.proof.links.map((href, i) => (
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

                      {task.proof.attachments && task.proof.attachments.length > 0 && (() => {
                        const images = task.proof.attachments.filter(isImageAttachment);
                        const files  = task.proof.attachments.filter((a) => !isImageAttachment(a));
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
                                      title={t('openFullSize', { name: att.name })}
                                      aria-label={t('openFullSize', { name: att.name })}
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

                    {(task.description || ev?.routedSource || (typeof ev?.iterations === 'number' && ev.iterations > 0)) && (
                      <details className="v2-vf-details">
                        <summary>
                          <span>{t('taskDetails')}</span>
                          <ChevronDown size={14} strokeWidth={2.2} />
                        </summary>
                        {task.description && (
                          <p className="v2-vf-desc">{cleanText(task.description)}</p>
                        )}
                        {(ev?.routedSource || (typeof ev?.iterations === 'number' && ev.iterations > 0)) && (
                          <div className="v2-vf-verdict-meta">
                            {ev?.routedSource && <span>{t('meta.source', { source: ev.routedSource })}</span>}
                            {typeof ev?.iterations === 'number' && ev.iterations > 0 && (
                              <span>{t('meta.iterations', { count: ev.iterations })}</span>
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
                          ? t('roleHint.owner')
                          : isAssignee
                            ? t('roleHint.assignee')
                            : t('roleHint.viewer')}
                      </small>
                    </div>

                    {canSubmitProof && (
                      <div className="v2-vf-proof">
                        <label className="v2-vf-field">
                          <span className="v2-vf-field-lab">{t('proofNoteLabel')}</span>
                          <textarea
                            className="v2-vf-textarea"
                            rows={3}
                            placeholder={t('proofNotePlaceholder')}
                            value={proof?.text ?? ''}
                            onChange={(e) => updateProofField(task.id, { text: e.target.value })}
                            disabled={isWorking}
                          />
                        </label>
                        <label className="v2-vf-field">
                          <span className="v2-vf-field-lab">{t('linksLabel')}</span>
                          <input
                            type="text"
                            className="v2-vf-input"
                            placeholder={t('linksPlaceholder')}
                            value={proof?.links ?? ''}
                            onChange={(e) => updateProofField(task.id, { links: e.target.value })}
                            disabled={isWorking}
                          />
                        </label>
                        <ProofDropZone
                          uploading={uploadingId === task.id}
                          onPick={(files) => handleUpload(task, files)}
                          files={proof?.attachments ?? []}
                          onRemove={(idx) => {
                            const next = [...(proof?.attachments ?? [])];
                            next.splice(idx, 1);
                            updateProofField(task.id, { attachments: next });
                          }}
                        />
                      </div>
                    )}

                    <footer className="v2-vf-actions">
                      {canSubmitProof && (
                        <Button
                          variant="primary"
                          size="md"
                          loading={isWorking}
                          onClick={() => submitProof(task)}
                        >
                          <UploadCloud size={14} strokeWidth={2.2} />
                          {t('submitProof')}
                        </Button>
                      )}
                      {/* Owner-only: hidden (not disabled-with-tooltip) for
                          non-owners — the roleHint small-text above already
                          explains who can act (C-25). */}
                      {isOwner && (
                        <Button
                          variant="success"
                          size="md"
                          disabled={isWorking}
                          onClick={() => overrideTask(task)}
                        >
                          <CheckCircle2 size={14} strokeWidth={2.2} />
                          {t('markComplete')}
                        </Button>
                      )}
                      {(isAssignee || isOwner) && (
                        <Button
                          variant="secondary"
                          size="md"
                          disabled={isWorking}
                          onClick={() => declineTask(task)}
                        >
                          <XCircle size={14} strokeWidth={2.2} />
                          {isAssignee ? t('decline') : t('reassign')}
                        </Button>
                      )}
                    </footer>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog.Root open={lightbox !== null} onOpenChange={(open) => { if (!open) setLightbox(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="v2-vf-lightbox-overlay" />
          {lightbox && (
            <Dialog.Content
              className="v2-vf-lightbox"
              aria-label={t('lightbox.previewLabel', { name: lightbox.name })}
              aria-describedby={undefined}
            >
              <Dialog.Title className="v2-vf-srtitle">
                {t('lightbox.previewLabel', { name: lightbox.name })}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="v2-vf-lightbox-close"
                  aria-label={t('lightbox.close')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </Dialog.Close>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt={lightbox.name}
                className="v2-vf-lightbox-img"
              />
              <div className="v2-vf-lightbox-caption">
                <span>{lightbox.name}</span>
                <a href={lightbox.url} target="_blank" rel="noopener noreferrer" className="v2-vf-lightbox-open">
                  {t('lightbox.openOriginal')}
                </a>
              </div>
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>

      <style>{stylesheet}</style>
    </div>
  );
}

export default function V2VerifyPage() {
  return (
    <Suspense fallback={<div className="v2-vf"><Skeleton width="100%" height={132} radius={12} /></div>}>
      <V2VerifyInner />
    </Suspense>
  );
}

const stylesheet = `
  .v2-vf {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 1180px;
    margin: 0 auto;
    animation: v2vfFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes v2vfFade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }

  /* ── HERO HEADER ─────────────────────────────────────────────────── */
  .v2-vf-hero.glass-card {
    position: relative;
    padding: 16px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 14px;
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
    height: 1px;
    opacity: 0.8;
  }
  .v2-vf-hero[data-tone='good']::before { background: linear-gradient(90deg, transparent, var(--success), transparent); }
  .v2-vf-hero[data-tone='warn']::before { background: linear-gradient(90deg, transparent, var(--warning), transparent); }
  .v2-vf-hero[data-tone='crit']::before { background: linear-gradient(90deg, transparent, var(--danger), transparent); }

  .v2-vf-back {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--txt-faint);
    text-decoration: none;
    font-weight: 700;
    transition: color 180ms ease, gap var(--dur-base) cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .v2-vf-back:hover { color: var(--signature); gap: 10px; }
  .v2-vf-back:hover svg { transform: translateX(-2px); }
  .v2-vf-back svg { transition: transform var(--dur-base) ease; }

  .v2-vf-hero-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 18px;
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
    font-size: 12px;
    color: var(--txt-muted);
    font-weight: 700;
    width: fit-content;
  }

  .v2-vf-headline {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.18;
    color: var(--txt-pure);
  }
  .v2-vf-sub {
    margin: 0;
    font-size: 13px;
    color: var(--txt-muted);
    line-height: 1.5;
    max-width: 620px;
  }

  .v2-vf-hero-right {
    display: grid;
    grid-template-columns: repeat(3, minmax(92px, 1fr));
    min-width: 328px;
    gap: 6px;
  }
  .v2-vf-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    min-width: 0;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.025);
  }
  .v2-vf-stat svg { color: var(--txt-faint); }
  .v2-vf-stat[data-tone='crit'] { border-color: rgba(var(--danger-rgb), 0.24); }
  .v2-vf-stat[data-tone='warn'] { border-color: rgba(var(--warning-rgb), 0.24); }
  .v2-vf-stat-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 19px;
    font-weight: 700;
    line-height: 1;
    color: var(--txt-pure);
    font-variant-numeric: tabular-nums;
  }
  .v2-vf-stat[data-tone='crit'] .v2-vf-stat-num { color: var(--danger); }
  .v2-vf-stat[data-tone='warn'] .v2-vf-stat-num { color: var(--warning); }
  .v2-vf-stat-lab {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-faint);
    font-weight: 600;
    white-space: normal;
    line-height: 1.2;
  }

  /* Filter pills row sits inside the hero so the page reads as one unit. */
  .v2-vf-pills {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--rule);
    border-radius: 8px;
    width: 100%;
  }
  .v2-vf-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 130px;
    min-height: 34px;
    gap: 8px;
    padding: 7px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
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
    padding: 0;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
  .v2-vf-card[data-tone='crit'] .v2-vf-card-rib { background: var(--danger); box-shadow: 0 0 10px rgba(var(--danger-rgb), 0.55); }
  .v2-vf-card[data-tone='warn'] .v2-vf-card-rib { background: var(--warning); }
  .v2-vf-card[data-tone='info'] .v2-vf-card-rib { background: var(--signature); }
  .v2-vf-card[data-tone='mute'] .v2-vf-card-rib { background: var(--txt-faint); }

  .v2-vf-card-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
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
  .v2-vf-status[data-tone='crit'] { color: var(--danger); border-color: rgba(var(--danger-rgb), 0.32); background: rgba(var(--danger-rgb), 0.08); }
  .v2-vf-status[data-tone='warn'] { color: var(--warning); border-color: rgba(var(--warning-rgb), 0.32); background: rgba(var(--warning-rgb), 0.08); }
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
    font-size: 16px;
    font-weight: 600;
    color: var(--txt-pure);
    line-height: 1.35;
  }
  .v2-vf-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--txt-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .v2-vf-verdict {
    margin: 0;
    padding: 11px 13px;
    background: rgba(255, 255, 255, 0.028);
    border: 1px solid var(--rule);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .v2-vf-card[data-tone='crit'] .v2-vf-verdict { background: rgba(var(--danger-rgb), 0.055); border-color: rgba(var(--danger-rgb), 0.2); }
  .v2-vf-verdict-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .v2-vf-verdict-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-vf-card[data-tone='crit'] .v2-vf-verdict-tag { color: var(--danger); }
  .v2-vf-verdict-conf {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-faint);
    font-variant-numeric: tabular-nums;
  }
  .v2-vf-verdict-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--txt-pure);
  }
  .v2-vf-verdict-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .v2-vf-submitted-tag {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--txt-muted);
    font-weight: 700;
  }
  .v2-vf-submitted-meta {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-faint);
    text-transform: uppercase;
  }
  .v2-vf-submitted-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--txt-pure);
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
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
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
    transition: transform var(--dur-base) cubic-bezier(0.2, 0.8, 0.2, 1), border-color 180ms ease, box-shadow var(--dur-base) ease;
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
    font-size: 10px;
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

  /* Lightbox — Radix Dialog. Overlay carries the dimmed backdrop; the
     Content layer is click-through except for its children, so clicking
     the backdrop closes via Radix's outside-pointer handling. */
  .v2-vf-lightbox-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.86);
    backdrop-filter: blur(8px) saturate(120%);
    -webkit-backdrop-filter: blur(8px) saturate(120%);
    cursor: zoom-out;
    animation: v2vfLbFade 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .v2-vf-lightbox {
    position: fixed;
    inset: 0;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 48px 24px 24px;
    pointer-events: none;
    animation: v2vfLbFade 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .v2-vf-lightbox > * { pointer-events: auto; }
  /* Screen-reader-only dialog title (Radix requires one). */
  .v2-vf-srtitle {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    clip: rect(0 0 0 0);
    overflow: hidden;
    white-space: nowrap;
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
    font-size: 10px;
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
    border-radius: 6px;
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
  }
  .v2-vf-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .v2-vf-field-lab {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-vf-textarea, .v2-vf-input {
    width: 100%;
    padding: 9px 11px;
    background: rgba(0, 0, 0, 0.2);
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

  /* Actions stack the shared ui/Button full-width inside the decision rail. */
  .v2-vf-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .v2-vf-actions .ui-btn {
    width: 100%;
    min-height: 36px;
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
    background: rgba(var(--success-rgb), 0.12);
    color: var(--success);
    flex-shrink: 0;
    box-shadow: 0 0 0 1px rgba(var(--success-rgb), 0.3), 0 6px 18px rgba(var(--success-rgb), 0.14);
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
    font-size: 12px;
    color: var(--txt-muted);
    line-height: 1.5;
    max-width: 540px;
  }
  /* Fetch-failure variant — same anatomy as the all-clear card but
     unmistakably crit-toned, with a retry action (C-03). */
  .v2-vf-empty.is-error { flex-wrap: wrap; }
  .v2-vf-empty-glyph.is-error {
    background: rgba(var(--danger-rgb), 0.12);
    color: var(--danger);
    box-shadow: 0 0 0 1px rgba(var(--danger-rgb), 0.3), 0 6px 18px rgba(var(--danger-rgb), 0.14);
  }
  .v2-vf-empty-retry {
    margin-left: auto;
    flex-shrink: 0;
  }

  /* ── CARD GRID: decision rail + collapsible details ─────────────── */
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
    transition: transform var(--dur-fast) ease;
  }
  .v2-vf-details .v2-vf-desc,
  .v2-vf-details .v2-vf-verdict-meta {
    padding: 0 12px 12px;
  }

  /* ── LIGHT MODE ─────────────────────────────────────────────────────
     Dark-hardcoded and white-alpha surfaces need explicit light-theme
     fills, mirroring the tasks-page approach (C-13). */
  .light .v2-vf-stat { background: rgba(20, 14, 30, 0.03); }
  .light .v2-vf-pills { background: rgba(20, 14, 30, 0.04); }
  .light .v2-vf-pill:hover:not(:disabled):not(.is-active) { background: rgba(20, 14, 30, 0.05); }
  .light .v2-vf-pill.is-active { background: rgba(20, 14, 30, 0.08); }
  .light .v2-vf-verdict { background: rgba(20, 14, 30, 0.03); }
  .light .v2-vf-submitted { background: rgba(20, 14, 30, 0.03); }
  .light .v2-vf-submitted-link,
  .light .v2-vf-submitted-file { background: rgba(20, 14, 30, 0.04); }
  .light .v2-vf-textarea,
  .light .v2-vf-input { background: rgba(20, 14, 30, 0.04); }
  .light .v2-vf-textarea:focus,
  .light .v2-vf-input:focus { background: rgba(20, 14, 30, 0.07); }
  .light .v2-vf-decision { background: rgba(20, 14, 30, 0.02); }
  .light .v2-vf-details { background: rgba(20, 14, 30, 0.02); }

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

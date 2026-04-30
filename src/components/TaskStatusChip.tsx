'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VerificationEvidence, VerificationStage, VerificationStatus } from '@/lib/recgon/types';

export type WorkflowStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'awaiting_review'
  | 'completed'
  | 'declined'
  | 'failed'
  | 'cancelled';

type Tone = 'idle' | 'progress' | 'review' | 'action' | 'ok' | 'warn' | 'fail';

const TONE_COLOR: Record<Tone, string> = {
  idle: 'var(--txt-muted)',
  progress: '#0ea5e9',
  review: '#f59e0b',
  action: '#f59e0b',
  ok: '#10b981',
  warn: '#f59e0b',
  fail: '#ef4444',
};

type ChipResolution = {
  label: string;
  tone: Tone;
  spinning: boolean;
  // The chip is the *next thing the user sees about this task*. So it picks
  // verification first (because that's where action/attention usually sits)
  // then falls back to workflow status.
  source: 'verification' | 'workflow';
};

function resolveChip(
  status: WorkflowStatus,
  verify: VerificationStatus | undefined | null,
): ChipResolution {
  switch (verify) {
    case 'proof_requested':
      return { label: 'Proof needed', tone: 'action', spinning: false, source: 'verification' };
    case 'auto_running':
      return { label: 'Verifying', tone: 'progress', spinning: true, source: 'verification' };
    case 'proof_evaluating':
      return { label: 'Re-checking proof', tone: 'progress', spinning: true, source: 'verification' };
    case 'failed':
      return { label: 'Verification failed', tone: 'fail', spinning: false, source: 'verification' };
    case 'passed':
    case 'auto_passed':
      return { label: 'Verified', tone: 'ok', spinning: false, source: 'verification' };
    case 'auto_inconclusive':
      return { label: 'Inconclusive', tone: 'warn', spinning: false, source: 'verification' };
    case 'owner_override':
      return { label: 'Owner verified', tone: 'ok', spinning: false, source: 'verification' };
    default:
      break;
  }
  switch (status) {
    case 'unassigned': return { label: 'Unassigned', tone: 'idle', spinning: false, source: 'workflow' };
    case 'assigned':   return { label: 'Assigned', tone: 'progress', spinning: false, source: 'workflow' };
    case 'accepted':
    case 'in_progress':return { label: 'In progress', tone: 'progress', spinning: false, source: 'workflow' };
    case 'awaiting_review': return { label: 'In review', tone: 'review', spinning: false, source: 'workflow' };
    case 'completed':  return { label: 'Completed', tone: 'ok', spinning: false, source: 'workflow' };
    case 'declined':   return { label: 'Declined', tone: 'fail', spinning: false, source: 'workflow' };
    case 'failed':     return { label: 'Failed', tone: 'fail', spinning: false, source: 'workflow' };
    case 'cancelled':  return { label: 'Cancelled', tone: 'idle', spinning: false, source: 'workflow' };
  }
}

function fetchVerb(source: string | undefined): string {
  switch (source) {
    case 'github_commits': return 'Reading GitHub commits and the diff to find changes related to this task…';
    case 'ga4_metric': return 'Pulling 14 days of GA4 metric numbers to compare against the baseline…';
    case 'instagram_graph': return 'Reading your Instagram posts and reels via the Meta Graph API…';
    case 'marketing_artifacts': return 'Looking up marketing content the team produced around this task…';
    case 'web_fetch': return 'Fetching the URL with Firecrawl and reading the page itself…';
    case 'proof_writeup': return 'Reading the proof writeup you submitted…';
    default: return 'Fetching evidence from the chosen source…';
  }
}

function describeStage(stage: VerificationStage | undefined, source: string | undefined): string {
  switch (stage) {
    case 'routing':
      return 'Reading the task and picking the best evidence source (GitHub commits, GA4, Instagram, marketing artifacts, web fetch, or proof writeup)…';
    case 'fetching':
      return fetchVerb(source);
    case 'judging':
      return source
        ? `Recgon is reading the evidence from ${source.replace(/_/g, ' ')} and deciding pass / fail / inconclusive…`
        : 'Recgon is reading the evidence and deciding pass / fail / inconclusive…';
    case 'rating':
      return 'Task passed — recording a quality rating to update the assignee\'s fit profile…';
    default:
      return '';
  }
}

export function describeVerification(
  status: VerificationStatus | undefined | null,
  evidence: VerificationEvidence | null | undefined,
): string {
  if (!status) return '';
  const detail = evidence?.stageDetail?.trim();
  const stageText = detail || describeStage(evidence?.stage, evidence?.routedSource);
  if (status === 'auto_running') {
    return stageText || 'Starting up — loading the task and getting ready to read evidence…';
  }
  if (status === 'proof_evaluating') {
    return stageText || 'Re-reading your proof and re-judging the task…';
  }
  if (status === 'proof_requested') {
    const reason = evidence?.verdict?.trim();
    return reason
      ? `Recgon couldn't auto-verify. ${reason}`
      : 'Recgon couldn\'t find enough automatic evidence. Send a note, link, or file as proof.';
  }
  if (status === 'passed' || status === 'auto_passed') {
    return evidence?.verdict ? `Auto-verified — ${evidence.verdict}` : 'Auto-verified by Recgon.';
  }
  if (status === 'failed') {
    return evidence?.verdict ? `Verification failed — ${evidence.verdict}` : 'Verification failed.';
  }
  if (status === 'auto_inconclusive') {
    return evidence?.verdict ? `Inconclusive — ${evidence.verdict}` : 'Recgon ran but couldn\'t reach a verdict.';
  }
  if (status === 'owner_override') {
    return 'Marked complete by the team owner — verification was bypassed.';
  }
  return '';
}

type Props = {
  status: WorkflowStatus;
  verification?: VerificationStatus | null;
  evidence?: VerificationEvidence | null;
  /** Optional small workflow-state hint shown next to the chip, e.g. "p2" or assignee name */
  meta?: React.ReactNode;
  size?: 'sm' | 'md';
};

export function TaskStatusChip({ status, verification, evidence, size = 'sm' }: Props) {
  const chip = resolveChip(status, verification ?? null);
  const tooltip = describeVerification(verification ?? null, evidence ?? null);
  const color = TONE_COLOR[chip.tone];
  const tipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxWidth: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const computePos = () => {
    const r = wrapperRef.current?.getBoundingClientRect();
    if (!r) return;
    const padding = 12;
    const desiredMax = 360;
    const availableRight = window.innerWidth - r.left - padding;
    const maxWidth = Math.max(220, Math.min(desiredMax, availableRight));
    setPos({ top: r.bottom + 8, left: r.left, maxWidth });
  };

  const showTooltip = !!tooltip && open;

  const padX = size === 'sm' ? 8 : 10;
  const padY = size === 'sm' ? 2 : 3;
  const fontSize = size === 'sm' ? '0.7rem' : '0.78rem';

  return (
    <span
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => { if (tooltip) { computePos(); setOpen(true); } }}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role={tooltip ? 'button' : undefined}
        tabIndex={tooltip ? 0 : -1}
        aria-describedby={showTooltip ? tipId : undefined}
        onFocus={() => { if (tooltip) { computePos(); setOpen(true); } }}
        onBlur={() => setOpen(false)}
        onClick={() => { if (tooltip) { computePos(); setOpen((o) => !o); } }}
        onKeyDown={(e) => {
          if (!tooltip) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            computePos();
            setOpen((o) => !o);
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color,
          border: `1px solid ${color}`,
          padding: `${padY}px ${padX}px`,
          borderRadius: 'var(--r-pill)',
          fontSize,
          fontWeight: 600,
          letterSpacing: '0.02em',
          background: `color-mix(in srgb, ${color} 8%, transparent)`,
          cursor: tooltip ? 'help' : 'default',
          outlineOffset: 2,
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {chip.spinning ? (
          <span
            aria-hidden
            style={{
              width: 8, height: 8, borderRadius: '50%',
              border: `2px solid color-mix(in srgb, ${color} 35%, transparent)`,
              borderTopColor: color,
              animation: 'recgon-spin 0.7s linear infinite',
              display: 'inline-block',
            }}
          />
        ) : (
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        )}
        {chip.label}
      </span>
      {mounted && showTooltip && pos && createPortal(
        <span
          id={tipId}
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            width: 'max-content',
            maxWidth: pos.maxWidth,
            maxHeight: 240,
            overflowY: 'auto',
            padding: '10px 12px',
            background: 'var(--bg-deep, #0e0e12)',
            border: `1px solid ${color}`,
            borderRadius: 8,
            fontSize: '0.74rem',
            fontWeight: 400,
            lineHeight: 1.45,
            color: 'var(--txt-pure, #f4f4f6)',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
          }}
        >
          {tooltip}
        </span>,
        document.body,
      )}
    </span>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import type {
  RecgonState,
  TeammateWithStats,
  AgentTask,
  TaskKind,
} from '@/lib/recgon/types';

const KIND_LABEL: Record<TaskKind, string> = {
  next_step: 'Next step',
  dev_prompt: 'Dev prompt',
  marketing: 'Marketing',
  analytics: 'Analytics',
  research: 'Research',
  custom: 'Task',
};

const KIND_SHORT: Record<TaskKind, string> = {
  next_step: 'next_step',
  dev_prompt: 'dev_prompt',
  marketing: 'marketing',
  analytics: 'analytics',
  research: 'research',
  custom: 'task',
};

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, '0');
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function StarMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="rcg-star-meter" title={`${value.toFixed(1)} / 5`}>
      <span className="rcg-star-track">
        <span className="rcg-star-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="rcg-star-num">{value.toFixed(1)}</span>
    </span>
  );
}

// Treat the legacy seed defaults as "unset" so cards prompt the user to pick
// a real role instead of showing a generic placeholder.
const SEED_TITLES = new Set(['Teammate', 'Observer']);
function hasRealRole(title: string | null | undefined): title is string {
  if (!title) return false;
  const trimmed = title.trim();
  return trimmed.length > 0 && !SEED_TITLES.has(trimmed);
}

function RosterCard({
  teammate: t,
  teamId,
  index,
}: {
  teammate: TeammateWithStats;
  teamId: string;
  index: number;
}) {
  const color = t.avatarColor || '#6366f1';
  const cap = t.capacityHours ?? 0;
  const used = (t.inFlightCount ?? 0) * 1.5;
  const loadPct = Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  return (
    <Link
      href={`/teams/${teamId}/teammates/${t.id}`}
      className="rcg-agent"
      style={{
        animationDelay: `${0.05 * index}s`,
        ['--agent-color' as string]: color,
      }}
    >
      <span className="rcg-agent-glow" aria-hidden />

      <header className="rcg-agent-head">
        <span className="rcg-agent-id">HU_{pad(index + 1, 2)}</span>
        <StarMeter value={t.stars} />
      </header>

      <div className="rcg-agent-identity">
        <div
          className="rcg-agent-avatar"
          style={{
            background: t.avatarUrl
              ? 'transparent'
              : `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 65%, #000))`,
          }}
        >
          {t.avatarUrl ? (
            <img src={t.avatarUrl} alt={t.displayName} className="rcg-agent-avatar-img" />
          ) : (
            initials(t.displayName)
          )}
        </div>
        <div className="rcg-agent-info">
          <h3 className="rcg-agent-name">{t.displayName}</h3>
          <p className="rcg-agent-title">
            {hasRealRole(t.title) ? (
              t.title
            ) : (
              <span className="rcg-agent-title-empty">
                no role yet · set on profile
              </span>
            )}
          </p>
          {t.teamRole && (
            <span className="rcg-agent-team-role" data-role={t.teamRole}>
              {t.teamRole}
            </span>
          )}
        </div>
      </div>

      <div className="rcg-agent-load" title={`${t.inFlightCount} in flight ≈ ${used.toFixed(1)}h of ${cap}h/wk`}>
        <div className="rcg-agent-load-row">
          <span className="rcg-agent-load-key">load</span>
          <span className="rcg-agent-load-val">{pad(t.inFlightCount)} in_flight · {loadPct}%</span>
        </div>
        <span className="rcg-agent-load-bar">
          <span
            className="rcg-agent-load-fill"
            data-tone={loadPct >= 90 ? 'hot' : loadPct >= 60 ? 'warm' : 'cool'}
            style={{ width: `${loadPct}%` }}
          />
        </span>
      </div>

      {t.skills.length > 0 && (
        <div className="rcg-agent-skills">
          {t.skills.slice(0, 4).map((s) => (
            <span key={s} className="rcg-skill-chip">{s}</span>
          ))}
          {t.skills.length > 4 && (
            <span className="rcg-skill-more">+{t.skills.length - 4}</span>
          )}
        </div>
      )}
    </Link>
  );
}

export default function RecgonAdminPanel({ teamId }: { teamId: string }) {
  const { addToast } = useToast();
  const [state, setState] = useState<RecgonState | null>(null);
  const [teammates, setTeammates] = useState<TeammateWithStats[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/teams/${teamId}/recgon`),
        fetch(`/api/teams/${teamId}/teammates`),
        fetch(`/api/teams/${teamId}/tasks`),
      ]);
      if (r1.ok) setState((await r1.json()).state);
      if (r2.ok) setTeammates((await r2.json()).teammates);
      if (r3.ok) setTasks((await r3.json()).tasks);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dispatch = async () => {
    setDispatching(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/recgon/dispatch`, { method: 'POST' });
      if (!res.ok) throw new Error('dispatch failed');
      const { result } = await res.json();
      addToast(
        `Recgon dispatched — ${result.minted} new, ${result.assigned} assigned, ${result.noFit} no-fit`,
        'success',
      );
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Dispatch failed', 'error');
    } finally {
      setDispatching(false);
    }
  };

  if (loading) {
    return (
      <div className="rcg-loading">
        <span className="rcg-loading-dot" />
        <span className="rcg-loading-dot" />
        <span className="rcg-loading-dot" />
        <span className="rcg-loading-text">booting recgon console</span>
        <style>{rcgStyles}</style>
      </div>
    );
  }

  const brain = state?.brainSnapshot;
  const inFlightTasks = tasks.filter((t) =>
    ['assigned', 'accepted', 'in_progress'].includes(t.status),
  );
  const reviewTasks = tasks.filter((t) => t.status === 'awaiting_review');
  const recentLog = state?.assignmentLog.slice(0, 5) ?? [];

  const totalEntries = brain?.totalEntries ?? 0;
  const byKind = brain?.byKind ?? ({} as Record<string, number>);
  const dispatchActive = !!state?.lastDispatchAt;

  return (
    <div className="rcg-panel">
      <style>{rcgStyles}</style>

      {/* ──────────────────── DISPATCH CONSOLE ──────────────────── */}
      <section className="rcg-console" aria-label="Recgon dispatch console">
        <div className="rcg-console-grid-bg" aria-hidden />
        <div className="rcg-console-pulse" aria-hidden />

        <header className="rcg-console-head">
          <div className="rcg-console-kicker">
            <span className="rcg-status-dot" data-active={dispatchActive ? '1' : '0'} />
            recgon · dispatch console
          </div>
          <div className="rcg-console-meta">
            <span className="rcg-meta-cell">
              <span className="rcg-meta-key">last_dispatch</span>
              <span className="rcg-meta-val">{relativeTime(state?.lastDispatchAt ?? null)}</span>
            </span>
            <span className="rcg-meta-sep" aria-hidden />
            <span className="rcg-meta-cell">
              <span className="rcg-meta-key">roster</span>
              <span className="rcg-meta-val">{pad(teammates.length)} agents</span>
            </span>
          </div>
        </header>

        <div className="rcg-console-body">
          <div className="rcg-readout">
            <div className="rcg-readout-num">{pad(totalEntries)}</div>
            <div className="rcg-readout-label">
              <span>open</span>
              <span>items</span>
            </div>
          </div>

          <div className="rcg-breakdown">
            <BreakdownRow label="next_step" count={byKind.next_step ?? 0} max={Math.max(totalEntries, 1)} primary />
            <BreakdownRow label="dev_prompt" count={byKind.dev_prompt ?? 0} max={Math.max(totalEntries, 1)} />
            <BreakdownRow label="marketing" count={byKind.marketing ?? 0} max={Math.max(totalEntries, 1)} />
            <BreakdownRow label="analytics" count={byKind.analytics ?? 0} max={Math.max(totalEntries, 1)} />
            <BreakdownRow label="research" count={byKind.research ?? 0} max={Math.max(totalEntries, 1)} />
          </div>

          <div className="rcg-dispatch-wrap">
            <button
              onClick={dispatch}
              disabled={dispatching}
              className="rcg-dispatch-btn"
              data-loading={dispatching ? '1' : undefined}
            >
              <span className="rcg-dispatch-btn-bg" aria-hidden />
              <span className="rcg-dispatch-btn-content">
                <span className="rcg-dispatch-label">
                  {dispatching ? 'dispatching' : 'run dispatch'}
                </span>
                <span className="rcg-dispatch-icon">
                  {dispatching ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </span>
              </span>
            </button>
            {!brain && (
              <p className="rcg-dispatch-hint">
                No brain snapshot yet — run a dispatch to scan analyses, mint tasks, and assign agents.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ──────────────────── ASSIGNMENT TICKER ──────────────────── */}
      {recentLog.length > 0 && (
        <section className="rcg-ticker">
          <header className="rcg-block-head">
            <span className="rcg-block-kicker">assignment ticker · {pad(recentLog.length)} recent</span>
            <Link href={`/teams/${teamId}/tasks`} className="rcg-block-link">
              view feed →
            </Link>
          </header>
          <div className="rcg-ticker-body">
            {recentLog.map((entry, i) => {
              const score = typeof entry.score === 'number' ? entry.score : 0;
              const scorePct = Math.max(0, Math.min(100, score * 100));
              return (
                <div
                  key={`${entry.taskId}-${entry.ts}`}
                  className="rcg-ticker-row"
                  style={{ animationDelay: `${0.04 * i}s` }}
                >
                  <span className="rcg-ticker-id">T{pad(i, 2)}</span>
                  <span className="rcg-ticker-title" title={entry.taskTitle}>
                    {truncate(entry.taskTitle.replace(/\*\*/g, ''), 64)}
                  </span>
                  <span className="rcg-ticker-arrow" aria-hidden>→</span>
                  <span
                    className="rcg-ticker-target"
                    data-nofit={!entry.teammateName ? '1' : undefined}
                  >
                    {entry.teammateName ?? 'no fit'}
                  </span>
                  <span className="rcg-ticker-score" data-nofit={!entry.teammateName ? '1' : undefined}>
                    <span className="rcg-ticker-score-bar">
                      <span className="rcg-ticker-score-fill" style={{ width: `${scorePct}%` }} />
                    </span>
                    <span className="rcg-ticker-score-num">{score.toFixed(2)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ──────────────────── ROSTER ──────────────────── */}
      {(() => {
        const humans = teammates.filter((t) => t.kind === 'human');
        const totalHours = humans.reduce((sum, t) => sum + (t.capacityHours ?? 0), 0);
        const totalInFlight = humans.reduce((sum, t) => sum + (t.inFlightCount ?? 0), 0);
        return (
          <section className="rcg-roster-section">
            <header className="rcg-roster-head">
              <div className="rcg-roster-head-l">
                <span className="rcg-block-kicker">roster</span>
                <span className="rcg-roster-summary">
                  <span className="rcg-roster-summary-n">{pad(humans.length)}</span>
                  <span className="rcg-roster-summary-k">teammates</span>
                  <span className="rcg-roster-summary-sep" aria-hidden />
                  <span className="rcg-roster-summary-n">{pad(totalInFlight)}</span>
                  <span className="rcg-roster-summary-k">in_flight</span>
                  <span className="rcg-roster-summary-sep" aria-hidden />
                  <span className="rcg-roster-summary-n">{totalHours}</span>
                  <span className="rcg-roster-summary-k">h/wk capacity</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const target = document.getElementById('invite');
                  if (!target) return;
                  // The page scrolls inside main.main-content, not the window —
                  // compute the offset against that scroll container.
                  const scroller =
                    target.closest('main') ?? document.scrollingElement ?? document.documentElement;
                  const top =
                    target.getBoundingClientRect().top -
                    scroller.getBoundingClientRect().top +
                    scroller.scrollTop -
                    24;
                  scroller.scrollTo({ top, behavior: 'smooth' });
                  target.classList.add('rcg-flash');
                  setTimeout(() => target.classList.remove('rcg-flash'), 1400);
                }}
                className="rcg-block-link rcg-block-link-btn"
              >
                invite teammate
              </button>
            </header>

            {humans.length === 0 ? (
              <div className="rcg-roster-empty">
                <span className="rcg-empty-glyph">⌬</span>
                <p className="rcg-empty-title">No teammates on the roster.</p>
                <p className="rcg-empty-copy">Invite a collaborator from the team page to start receiving dispatches.</p>
              </div>
            ) : (
              <div className="rcg-roster-grid">
                {humans.map((t, i) => (
                  <RosterCard key={t.id} teammate={t} teamId={teamId} index={i} />
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* ──────────────────── TASK SUMMARY ──────────────────── */}
      {(inFlightTasks.length > 0 || reviewTasks.length > 0) && (
        <section className="rcg-tasks">
          <header className="rcg-block-head">
            <span className="rcg-block-kicker">queue · {pad(inFlightTasks.length + reviewTasks.length)} active</span>
            <Link href={`/teams/${teamId}/tasks`} className="rcg-block-link">view all →</Link>
          </header>
          <div className="rcg-tasks-stats">
            <div className="rcg-tasks-stat">
              <span className="rcg-tasks-num">{pad(inFlightTasks.length)}</span>
              <span className="rcg-tasks-key">in_flight</span>
            </div>
            <div className="rcg-tasks-divider" />
            <div className="rcg-tasks-stat">
              <span className="rcg-tasks-num" data-attention={reviewTasks.length > 0 ? '1' : undefined}>
                {pad(reviewTasks.length)}
              </span>
              <span className="rcg-tasks-key">awaiting_review</span>
            </div>
          </div>
          {reviewTasks.length > 0 && (
            <div className="rcg-tasks-list">
              {reviewTasks.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/teams/${teamId}/tasks?focus=${t.id}`}
                  className="rcg-task-row"
                >
                  <span className="rcg-task-kind">{KIND_SHORT[t.kind]}</span>
                  <span className="rcg-task-title">{t.title}</span>
                  <span className="rcg-task-arrow">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  count,
  max,
  primary,
}: {
  label: string;
  count: number;
  max: number;
  primary?: boolean;
}) {
  const pct = max === 0 ? 0 : Math.max(2, (count / max) * 100);
  return (
    <div className="rcg-bd-row" data-primary={primary ? '1' : undefined}>
      <span className="rcg-bd-label">{label}</span>
      <span className="rcg-bd-bar">
        <span className="rcg-bd-fill" style={{ width: count > 0 ? `${pct}%` : 0 }} />
      </span>
      <span className="rcg-bd-num">{pad(count)}</span>
    </div>
  );
}

const rcgStyles = `
  /* ─── ANIMATIONS ─── */
  @keyframes rcgFadeUp {
    from { opacity: 0; transform: translateY(8px); filter: blur(4px); }
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  @keyframes rcgPulseDot {
    0%, 100% { box-shadow: 0 0 0 0 rgba(var(--signature-rgb), 0.55); }
    50% { box-shadow: 0 0 0 6px rgba(var(--signature-rgb), 0); }
  }
  @keyframes rcgPulseRadial {
    0%, 100% { opacity: 0.45; transform: scale(1); }
    50% { opacity: 0.85; transform: scale(1.08); }
  }
  @keyframes rcgBarGrow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }
  @keyframes rcgLoadDot {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }
  @keyframes rcgSpin { to { transform: rotate(360deg); } }

  /* ─── PANEL ─── */
  .rcg-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-bottom: 28px;
  }

  .rcg-loading {
    display: flex; align-items: center; gap: 10px;
    padding: 32px 20px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    letter-spacing: 1px;
    color: var(--txt-muted);
    background: var(--bg-content);
    border: 1px dashed rgba(var(--signature-rgb), 0.22);
    border-radius: 18px;
    text-transform: uppercase;
  }
  .rcg-loading-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--signature);
    animation: rcgLoadDot 1.4s infinite ease-in-out both;
  }
  .rcg-loading-dot:nth-child(1) { animation-delay: -0.32s; }
  .rcg-loading-dot:nth-child(2) { animation-delay: -0.16s; }
  .rcg-loading-text { margin-left: 6px; }

  /* ─── BLOCK HEADER (kicker + link) ─── */
  .rcg-block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 12px;
  }
  .rcg-block-kicker {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--signature);
    text-transform: uppercase;
    letter-spacing: 1.2px;
    opacity: 0.85;
  }
  .rcg-block-kicker::before { content: '// '; opacity: 0.5; }
  .rcg-block-link {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 600;
    color: var(--txt-muted);
    text-decoration: none;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--btn-secondary-border);
    background: var(--btn-secondary-bg);
    transition: color 0.18s, border-color 0.18s, background 0.18s;
  }
  .rcg-block-link:hover {
    color: var(--signature);
    border-color: rgba(var(--signature-rgb), 0.35);
    background: rgba(var(--signature-rgb), 0.06);
  }
  .rcg-block-link-btn {
    cursor: pointer;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }
  @keyframes rcgFlash {
    0% { box-shadow: 0 0 0 0 rgba(var(--signature-rgb), 0.55); }
    100% { box-shadow: 0 0 0 12px rgba(var(--signature-rgb), 0); }
  }
  .rcg-flash {
    animation: rcgFlash 1.4s ease-out;
  }
  .rcg-add-link { color: var(--signature); border-color: rgba(var(--signature-rgb), 0.32); background: rgba(var(--signature-rgb), 0.06); }
  .rcg-add-plus { display: inline-block; margin-right: 4px; font-size: 13px; line-height: 1; transform: translateY(-1px); }

  /* ──────────────────── DISPATCH CONSOLE ──────────────────── */
  .rcg-console {
    position: relative;
    padding: 28px;
    border-radius: 24px;
    overflow: hidden;
    background: var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(var(--signature-rgb), 0.55) 0%,
        rgba(var(--signature-rgb), 0.10) 40%,
        rgba(var(--signature-rgb), 0.32) 100%) border-box;
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border: 1px solid transparent;
    box-shadow: var(--shadow-deep), var(--edge-highlight);
    isolation: isolate;
    animation: rcgFadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .rcg-console-grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(var(--signature-rgb), 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--signature-rgb), 0.07) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 60% 50% at 75% 0%, black 0%, transparent 70%);
    -webkit-mask-image: radial-gradient(ellipse 60% 50% at 75% 0%, black 0%, transparent 70%);
    z-index: 0; pointer-events: none;
  }
  .rcg-console-pulse {
    position: absolute;
    top: -30%; right: -10%;
    width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(var(--signature-rgb), 0.32) 0%, transparent 60%);
    z-index: 0; pointer-events: none;
    animation: rcgPulseRadial 6s ease-in-out infinite;
  }

  .rcg-console-head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 22px;
    padding-bottom: 16px;
    border-bottom: 1px dashed rgba(var(--signature-rgb), 0.18);
  }
  .rcg-console-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--signature);
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
  .rcg-console-kicker::before { content: '// '; opacity: 0.5; }
  .rcg-status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--signature);
    box-shadow: 0 0 8px var(--signature);
    animation: rcgPulseDot 2s infinite ease-in-out;
  }
  .rcg-status-dot[data-active="0"] {
    background: var(--txt-faint);
    box-shadow: none;
    animation: none;
    opacity: 0.5;
  }

  .rcg-console-meta {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
  }
  .rcg-meta-cell {
    display: inline-flex; align-items: baseline; gap: 6px;
  }
  .rcg-meta-key { color: var(--txt-faint); text-transform: uppercase; }
  .rcg-meta-val { color: var(--txt-pure); font-weight: 600; }
  .rcg-meta-sep {
    width: 1px; height: 10px;
    background: var(--btn-secondary-border);
  }

  .rcg-console-body {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 32px;
    align-items: center;
  }
  @media (max-width: 720px) {
    .rcg-console-body {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }

  /* ─── Big readout ─── */
  .rcg-readout { position: relative; }
  .rcg-readout-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 86px;
    font-weight: 500;
    line-height: 0.9;
    letter-spacing: -3px;
    color: var(--txt-pure);
    background: linear-gradient(180deg, var(--txt-pure) 50%, color-mix(in srgb, var(--txt-pure) 65%, transparent));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 0 40px rgba(var(--signature-rgb), 0.25);
    font-variant-numeric: tabular-nums;
  }
  .rcg-readout-label {
    display: flex;
    flex-direction: column;
    margin-top: 6px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--txt-muted);
    line-height: 1.3;
  }
  .rcg-readout-label span:first-child { color: var(--signature); font-weight: 700; }

  /* ─── Breakdown bars ─── */
  .rcg-breakdown {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    justify-self: center;
  }
  .rcg-bd-row {
    display: grid;
    grid-template-columns: 88px minmax(60px, 220px) 24px;
    align-items: center;
    gap: 12px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.5px;
  }
  .rcg-bd-label {
    color: var(--txt-muted);
    text-transform: uppercase;
    text-align: right;
  }
  .rcg-bd-row[data-primary="1"] .rcg-bd-label { color: var(--signature); font-weight: 700; }
  .rcg-bd-bar {
    position: relative;
    height: 6px;
    background: rgba(0,0,0,0.08);
    border-radius: 3px;
    overflow: hidden;
  }
  .rcg-bd-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg,
      rgba(var(--signature-rgb), 0.22),
      rgba(var(--signature-rgb), 0.55));
    border-radius: 2px;
    transform-origin: left;
    animation: rcgBarGrow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.2s;
  }
  .rcg-bd-row[data-primary="1"] .rcg-bd-fill {
    background: linear-gradient(90deg, var(--signature), color-mix(in srgb, var(--signature) 60%, #fff));
    box-shadow: 0 0 8px rgba(var(--signature-rgb), 0.45);
  }
  .rcg-bd-num {
    color: var(--txt-pure);
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .rcg-bd-row[data-primary="1"] .rcg-bd-num { color: var(--signature); }

  /* ─── Dispatch button ─── */
  .rcg-dispatch-wrap {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    width: 188px;
  }
  .rcg-dispatch-btn {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    border-radius: 16px;
    background: transparent;
    cursor: pointer;
    isolation: isolate;
    overflow: hidden;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 0.3s ease;
    box-shadow:
      0 8px 24px -6px rgba(var(--signature-rgb), 0.35),
      0 0 36px -4px rgba(var(--signature-rgb), 0.28);
  }
  .rcg-dispatch-btn:not(:disabled):hover {
    box-shadow:
      0 14px 32px -6px rgba(var(--signature-rgb), 0.5),
      0 0 48px -4px rgba(var(--signature-rgb), 0.42);
  }
  .rcg-dispatch-btn:disabled { cursor: wait; }
  .rcg-dispatch-btn-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, var(--signature) 0%, color-mix(in srgb, var(--signature) 70%, #ff5494) 100%);
    z-index: 0;
    transition: filter 0.22s;
  }
  .rcg-dispatch-btn-bg::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.32), transparent 50%);
    pointer-events: none;
  }
  .rcg-dispatch-btn-bg::after {
    content: '';
    position: absolute;
    inset: -2px;
    background: conic-gradient(from 0deg,
      transparent 0%,
      rgba(255,255,255,0.5) 25%,
      transparent 50%);
    opacity: 0;
    z-index: -1;
    transition: opacity 0.3s;
    animation: rcgSpin 2.4s linear infinite paused;
  }
  .rcg-dispatch-btn[data-loading="1"] .rcg-dispatch-btn-bg::after {
    opacity: 0.7;
    animation-play-state: running;
  }
  .rcg-dispatch-btn-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px;
    color: #fff;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    text-shadow: 0 1px 0 rgba(0,0,0,0.18);
  }
  .rcg-dispatch-icon {
    display: inline-flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.35);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.18s;
  }
  .rcg-dispatch-btn[data-loading="1"] .rcg-dispatch-icon svg { animation: rcgSpin 1s linear infinite; }
  .rcg-dispatch-btn:not(:disabled):hover { transform: translateY(-2px); }
  .rcg-dispatch-btn:not(:disabled):hover .rcg-dispatch-btn-bg { filter: brightness(1.08); }
  .rcg-dispatch-btn:not(:disabled):hover .rcg-dispatch-icon {
    transform: translateX(3px) scale(1.08);
    background: rgba(255,255,255,0.32);
  }
  .rcg-dispatch-btn:not(:disabled):active { transform: translateY(0); }

  .rcg-dispatch-btn::before {
    content: '';
    position: absolute;
    inset: -4px;
    background: radial-gradient(ellipse, rgba(var(--signature-rgb), 0.12), transparent 70%);
    z-index: -1;
    opacity: 0.2;
    filter: blur(10px);
    transition: opacity 0.3s;
  }
  .rcg-dispatch-btn:not(:disabled):hover::before { opacity: 0.35; }

  .rcg-dispatch-hint {
    margin: 0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-muted);
    line-height: 1.55;
    letter-spacing: 0.2px;
  }

  /* ──────────────────── ASSIGNMENT TICKER ──────────────────── */
  .rcg-ticker {
    position: relative;
    padding: 22px 24px;
    border-radius: 18px;
    background: var(--bg-content);
    border: 1px solid var(--btn-secondary-border);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    box-shadow: var(--shadow-float);
    animation: rcgFadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.05s;
  }
  .rcg-ticker-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rcg-ticker-row {
    display: grid;
    grid-template-columns: 32px 1fr auto auto auto;
    align-items: center;
    gap: 12px;
    padding: 10px 8px;
    border-radius: 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    color: var(--txt);
    transition: background 0.15s;
    animation: rcgFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .rcg-ticker-row + .rcg-ticker-row { border-top: 1px dashed var(--btn-secondary-border); }
  .rcg-ticker-row:hover { background: rgba(var(--signature-rgb), 0.04); }
  .rcg-ticker-id {
    color: var(--txt-faint);
    font-size: 10px;
    letter-spacing: 0.5px;
    font-variant-numeric: tabular-nums;
  }
  .rcg-ticker-title {
    color: var(--txt-pure);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.1px;
  }
  .rcg-ticker-arrow {
    color: rgba(var(--signature-rgb), 0.55);
    font-weight: 700;
  }
  .rcg-ticker-target {
    font-size: 11px;
    color: var(--txt-pure);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 9px;
    background: rgba(var(--signature-rgb), 0.08);
    border: 1px solid rgba(var(--signature-rgb), 0.22);
    border-radius: 999px;
    white-space: nowrap;
  }
  .rcg-ticker-target[data-nofit="1"] {
    color: var(--txt-faint);
    background: rgba(0,0,0,0.04);
    border-color: var(--btn-secondary-border);
    text-transform: uppercase;
  }
  .rcg-ticker-score {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 76px;
  }
  .rcg-ticker-score-bar {
    width: 40px; height: 3px;
    background: rgba(0,0,0,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .rcg-ticker-score-fill {
    display: block; height: 100%;
    background: linear-gradient(90deg, rgba(var(--signature-rgb), 0.4), var(--signature));
    border-radius: 2px;
  }
  .rcg-ticker-score[data-nofit="1"] .rcg-ticker-score-fill { background: var(--txt-faint); }
  .rcg-ticker-score-num {
    color: var(--txt-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.2px;
  }

  /* ──────────────────── ROSTER ──────────────────── */
  .rcg-roster-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .rcg-roster-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px dashed var(--btn-secondary-border);
  }
  .rcg-roster-head-l {
    display: inline-flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .rcg-roster-summary {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--txt-muted);
    letter-spacing: 0.4px;
  }
  .rcg-roster-summary-n {
    color: var(--txt-pure);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .rcg-roster-summary-k {
    color: var(--txt-faint);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-size: 10px;
  }
  .rcg-roster-summary-sep {
    display: inline-block;
    width: 3px; height: 3px;
    border-radius: 50%;
    background: var(--txt-faint);
    opacity: 0.5;
    transform: translateY(-2px);
    margin: 0 4px;
  }
  .rcg-roster-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  /* ─── Per-card load bar ─── */
  .rcg-agent-load {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 9px 11px;
    background: rgba(0,0,0,0.025);
    border: 1px solid var(--btn-secondary-border);
    border-radius: 10px;
  }
  .rcg-agent-load-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.4px;
  }
  .rcg-agent-load-key {
    color: var(--txt-faint);
    text-transform: uppercase;
  }
  .rcg-agent-load-val {
    color: var(--txt-pure);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .rcg-agent-load-bar {
    position: relative;
    display: block;
    height: 4px;
    background: rgba(0,0,0,0.06);
    border-radius: 2px;
    overflow: hidden;
  }
  .rcg-agent-load-fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    transform-origin: left;
    transition: width 0.3s;
  }
  .rcg-agent-load-fill[data-tone="cool"] { background: var(--success); }
  .rcg-agent-load-fill[data-tone="warm"] { background: var(--warning); }
  .rcg-agent-load-fill[data-tone="hot"] { background: var(--danger); }

  .rcg-agent-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: inherit;
  }
  .rcg-roster-empty {
    padding: 48px 28px;
    text-align: center;
    border-radius: 18px;
    background: var(--bg-content);
    border: 1px dashed rgba(var(--signature-rgb), 0.28);
  }
  .rcg-empty-glyph {
    display: inline-block;
    font-size: 34px;
    color: var(--signature);
    margin-bottom: 12px;
    opacity: 0.7;
    text-shadow: 0 0 18px rgba(var(--signature-rgb), 0.45);
  }
  .rcg-empty-title { margin: 0 0 6px; font-size: 16px; font-weight: 600; color: var(--txt-pure); letter-spacing: -0.2px; }
  .rcg-empty-copy { margin: 0 auto 18px; max-width: 340px; font-size: 13px; color: var(--txt-muted); line-height: 1.55; }
  .rcg-empty-cta {
    display: inline-flex; align-items: center;
    padding: 9px 16px;
    background: var(--signature);
    color: #fff;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    border-radius: 999px;
    text-decoration: none;
    box-shadow: 0 6px 16px -4px rgba(var(--signature-rgb), 0.55);
    transition: transform 0.18s, box-shadow 0.18s;
  }
  .rcg-empty-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 22px -4px rgba(var(--signature-rgb), 0.7); }

  .rcg-agent {
    --agent-color: var(--signature);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 18px 16px;
    border-radius: 18px;
    text-decoration: none;
    color: inherit;
    background: var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(var(--signature-rgb), 0.22) 0%,
        rgba(255, 255, 255, 0.04) 50%,
        rgba(var(--signature-rgb), 0.10) 100%) border-box;
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border: 1px solid transparent;
    box-shadow: var(--shadow-float), var(--edge-highlight);
    isolation: isolate;
    overflow: hidden;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s, border-color 0.25s;
    animation: rcgFadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .rcg-agent-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 100% 0%, rgba(var(--signature-rgb), 0.18), transparent 55%);
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 0;
  }
  .rcg-agent > * { position: relative; z-index: 1; }
  .rcg-agent:hover {
    transform: translateY(-3px);
    box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.42),
                0 16px 40px -10px rgba(var(--signature-rgb), 0.28),
                var(--edge-highlight);
  }
  .rcg-agent:hover .rcg-agent-glow { opacity: 1; }

  .rcg-agent-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
  .rcg-agent-id {
    color: var(--txt-faint);
    font-weight: 600;
  }

  .rcg-agent-identity {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .rcg-agent-avatar {
    width: 48px; height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: 'Inter', sans-serif;
    font-weight: 800;
    font-size: 16px;
    letter-spacing: -0.5px;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.22),
                inset 0 -2px 6px rgba(0,0,0,0.14),
                0 6px 14px -4px color-mix(in srgb, var(--agent-color) 70%, transparent);
    transition: box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .rcg-agent:hover .rcg-agent-avatar {
    box-shadow:
      0 0 0 4px rgba(var(--signature-rgb), 0.18),
      0 0 26px 3px rgba(var(--signature-rgb), 0.55),
      0 8px 22px -4px rgba(var(--signature-rgb), 0.45),
      inset 0 1px 0 rgba(255,255,255,0.22),
      inset 0 -2px 6px rgba(0,0,0,0.14);
  }

  .rcg-agent-info { flex: 1; min-width: 0; }
  .rcg-agent-name {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--txt-pure);
    letter-spacing: -0.2px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rcg-agent-title {
    margin: 2px 0 0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-muted);
    letter-spacing: 0.2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rcg-agent-title-empty { color: var(--txt-faint); font-style: italic; }
  .rcg-agent-title-set {
    color: var(--signature);
    text-decoration: none;
    font-style: normal;
    border-bottom: 1px dashed rgba(var(--signature-rgb), 0.4);
  }
  .rcg-agent-title-set:hover { border-bottom-color: var(--signature); }
  .rcg-agent-team-role {
    display: inline-block;
    margin-top: 5px;
    padding: 2px 7px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border: 1px solid var(--btn-secondary-border);
    background: var(--glass-substrate, rgba(0,0,0,0.04));
    color: var(--txt-muted);
  }
  .rcg-agent-team-role[data-role="owner"] {
    color: var(--signature);
    background: rgba(var(--signature-rgb), 0.08);
    border-color: rgba(var(--signature-rgb), 0.28);
  }

  /* ─── Star meter ─── */
  .rcg-star-meter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 90px;
  }
  .rcg-star-track {
    position: relative;
    flex: 1;
    min-width: 50px;
    height: 4px;
    background: rgba(0,0,0,0.06);
    border-radius: 3px;
    overflow: hidden;
  }
  .rcg-star-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(var(--signature-rgb), 0.45), var(--signature));
    border-radius: 3px;
    box-shadow: 0 0 6px rgba(var(--signature-rgb), 0.4);
    transform-origin: left;
    animation: rcgBarGrow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.2s;
  }
  .rcg-star-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--signature);
    letter-spacing: 0.2px;
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    text-align: right;
  }

  /* ─── Skill chips ─── */
  .rcg-agent-skills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: -2px;
  }
  .rcg-skill-chip {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(var(--signature-rgb), 0.07);
    color: var(--signature);
    border: 1px solid rgba(var(--signature-rgb), 0.16);
    letter-spacing: 0.3px;
    text-transform: lowercase;
  }
  .rcg-skill-more {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    color: var(--txt-faint);
    padding: 3px 6px;
    letter-spacing: 0.4px;
    align-self: center;
  }

  /* ──────────────────── TASK QUEUE ──────────────────── */
  .rcg-tasks {
    padding: 22px 24px;
    border-radius: 18px;
    background: var(--bg-content);
    border: 1px solid var(--btn-secondary-border);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    box-shadow: var(--shadow-float);
    animation: rcgFadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .rcg-tasks-stats {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .rcg-tasks-stat { display: flex; flex-direction: column; gap: 4px; }
  .rcg-tasks-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 28px;
    font-weight: 500;
    color: var(--txt-pure);
    letter-spacing: -1px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .rcg-tasks-num[data-attention="1"] {
    color: var(--signature);
    text-shadow: 0 0 12px rgba(var(--signature-rgb), 0.45);
  }
  .rcg-tasks-key {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .rcg-tasks-divider {
    width: 1px; height: 32px;
    background: var(--btn-secondary-border);
  }
  .rcg-tasks-list {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px dashed var(--btn-secondary-border);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rcg-task-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    font-size: 13px;
    transition: background 0.15s, transform 0.15s;
  }
  .rcg-task-row:hover {
    background: rgba(var(--signature-rgb), 0.05);
    transform: translateX(2px);
  }
  .rcg-task-kind {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9px;
    font-weight: 700;
    color: var(--signature);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 2px 7px;
    background: rgba(var(--signature-rgb), 0.08);
    border: 1px solid rgba(var(--signature-rgb), 0.18);
    border-radius: 6px;
    white-space: nowrap;
  }
  .rcg-task-title {
    color: var(--txt-pure);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.1px;
  }
  .rcg-task-arrow {
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    transition: color 0.15s, transform 0.15s;
  }
  .rcg-task-row:hover .rcg-task-arrow { color: var(--signature); transform: translateX(2px); }
`;

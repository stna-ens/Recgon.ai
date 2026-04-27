'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import type { Teammate, AgentTask } from '@/lib/recgon/types';

const STATUS_COLOR: Record<string, string> = {
  unassigned: '#6b7280',
  assigned: '#3b82f6',
  accepted: '#0ea5e9',
  in_progress: '#0ea5e9',
  awaiting_review: '#f59e0b',
  completed: '#10b981',
  declined: '#ef4444',
  failed: '#ef4444',
  cancelled: '#6b7280',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TeammateDetailPage({
  params,
}: {
  params: Promise<{ id: string; teammateId: string }>;
}) {
  const { id: teamId, teammateId } = use(params);
  const router = useRouter();
  const { addToast } = useToast();
  const [teammate, setTeammate] = useState<Teammate | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftSkills, setDraftSkills] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCapacity, setDraftCapacity] = useState<number>(168);
  const [draftHours, setDraftHours] = useState<{
    enabled: boolean;
    tz: string;
    start: number;
    end: number;
    days: { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean };
  }>({
    enabled: false,
    tz: 'UTC',
    start: 9,
    end: 17,
    days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  });

  const refresh = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/teams/${teamId}/teammates/${teammateId}`),
      fetch(`/api/teams/${teamId}/tasks?teammateId=${teammateId}`),
    ]);
    if (r1.ok) {
      const { teammate: t } = await r1.json();
      setTeammate(t);
      setDraftPrompt(t.systemPrompt ?? '');
      setDraftSkills((t.skills ?? []).join(', '));
      setDraftTitle(t.title ?? '');
      setDraftCapacity(Number(t.capacityHours ?? 168));
      const wh = t.workingHours;
      if (wh) {
        const firstDay = (['mon','tue','wed','thu','fri','sat','sun'] as const).find((d) => Array.isArray(wh[d]));
        const window = firstDay ? wh[firstDay] : null;
        setDraftHours({
          enabled: true,
          tz: wh.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          start: window ? window[0] : 9,
          end: window ? window[1] : 17,
          days: {
            mon: Array.isArray(wh.mon),
            tue: Array.isArray(wh.tue),
            wed: Array.isArray(wh.wed),
            thu: Array.isArray(wh.thu),
            fri: Array.isArray(wh.fri),
            sat: Array.isArray(wh.sat),
            sun: Array.isArray(wh.sun),
          },
        });
      } else {
        setDraftHours((prev) => ({
          ...prev,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }));
      }
    }
    if (r2.ok) setTasks((await r2.json()).tasks);
    setLoading(false);
  }, [teamId, teammateId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    const skills = draftSkills.split(',').map((s) => s.trim()).filter(Boolean);
    const workingHours = draftHours.enabled
      ? {
          tz: draftHours.tz || 'UTC',
          ...(draftHours.days.mon && { mon: [draftHours.start, draftHours.end] as [number, number] }),
          ...(draftHours.days.tue && { tue: [draftHours.start, draftHours.end] as [number, number] }),
          ...(draftHours.days.wed && { wed: [draftHours.start, draftHours.end] as [number, number] }),
          ...(draftHours.days.thu && { thu: [draftHours.start, draftHours.end] as [number, number] }),
          ...(draftHours.days.fri && { fri: [draftHours.start, draftHours.end] as [number, number] }),
          ...(draftHours.days.sat && { sat: [draftHours.start, draftHours.end] as [number, number] }),
          ...(draftHours.days.sun && { sun: [draftHours.start, draftHours.end] as [number, number] }),
        }
      : null;
    const res = await fetch(`/api/teams/${teamId}/teammates/${teammateId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: draftTitle.trim() || null,
        skills,
        systemPrompt: draftPrompt || null,
        capacityHours: Number.isFinite(draftCapacity) ? draftCapacity : 168,
        workingHours,
      }),
    });
    if (!res.ok) {
      addToast('Save failed', 'error');
      return;
    }
    addToast('Saved', 'success');
    setEditing(false);
    await refresh();
  };

  const retire = async () => {
    if (!confirm('Retire this teammate? They won\'t receive new tasks.')) return;
    const res = await fetch(`/api/teams/${teamId}/teammates/${teammateId}`, { method: 'DELETE' });
    if (!res.ok) {
      addToast('Retire failed', 'error');
      return;
    }
    addToast('Teammate retired', 'success');
    router.push(`/teams/${teamId}`);
  };

  const rate = async (taskId: string, rating: 1 | -1) => {
    const res = await fetch(`/api/teams/${teamId}/tasks/${taskId}/rating`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    if (!res.ok) {
      addToast('Rating failed', 'error');
      return;
    }
    addToast('Rated', 'success');
    await refresh();
  };

  if (loading) return <p style={{ color: 'var(--txt-muted)' }}>Loading…</p>;
  if (!teammate) return <p style={{ color: 'var(--danger)' }}>Teammate not found</p>;

  const completedTasks = tasks.filter((t) => t.status === 'awaiting_review' || t.status === 'completed');
  const activeTasks = tasks.filter((t) => ['assigned', 'accepted', 'in_progress'].includes(t.status));

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.75rem', fontFamily: 'inherit',
    background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.85rem',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <Link
        href={`/teams/${teamId}`}
        style={{ fontSize: '0.78rem', color: 'var(--txt-muted)', textDecoration: 'none' }}
      >
        ← Back to team
      </Link>

      {/* Header */}
      <div className="glass-card" style={{ padding: 20, marginTop: 14, borderRadius: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: teammate.avatarUrl ? 'transparent' : (teammate.avatarColor ?? 'var(--signature)'),
              color: 'white', fontSize: '1.4rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 6px rgba(0,0,0,0.12)',
            }}
          >
            {teammate.avatarUrl ? (
              <img
                src={teammate.avatarUrl}
                alt={teammate.displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              teammate.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--txt-pure)' }}>
                {teammate.displayName}
              </h2>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px',
                borderRadius: 4, color: teammate.kind === 'ai' ? 'var(--signature)' : 'var(--accent)',
                background: teammate.kind === 'ai' ? 'rgba(var(--signature-rgb), 0.1)' : 'var(--glass-substrate)',
                border: '1px solid var(--border)',
              }}>{teammate.kind.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--txt-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{teammate.title}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              {(() => {
                const cap = teammate.capacityHours;
                const inFlight = activeTasks.length;
                const usedHours = inFlight * 1.5;
                const pct = Math.min(100, Math.round((usedHours / Math.max(1, cap)) * 100));
                const tone = pct >= 90 ? 'var(--danger)' : pct >= 60 ? 'var(--warning)' : 'var(--success)';
                const semantic =
                  cap >= 160 ? 'Always-on' :
                  cap >= 70 ? 'Heavy' :
                  cap >= 35 ? 'Full-time' :
                  cap >= 15 ? 'Part-time' :
                  cap >= 8 ? 'Side project' :
                  'Spare time';
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11, color: 'var(--txt-pure)', fontWeight: 600 }}>
                      {semantic}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11, color: 'var(--txt-muted)' }}>
                      {cap}h/wk
                    </span>
                    <span title={`${inFlight} task${inFlight === 1 ? '' : 's'} in flight ≈ ${usedHours.toFixed(1)}h`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ position: 'relative', width: 50, height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <span style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: tone, borderRadius: 2, transition: 'width 0.3s' }} />
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10, color: tone, fontWeight: 600 }}>
                        {pct}%
                      </span>
                    </span>
                  </span>
                );
              })()}
            </div>
          </div>
          {teammate.kind === 'ai' && (
            <button
              onClick={retire}
              style={{
                fontSize: '0.78rem', padding: '6px 12px',
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 'var(--r-pill)', color: 'var(--txt-muted)',
                cursor: 'pointer',
              }}
            >
              Retire
            </button>
          )}
        </div>
      </div>

      {/* Skills + system prompt editor (AI only) */}
      <div className="glass-card" style={{ padding: 18, marginTop: 14, borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="recgon-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--txt-muted)' }}>
            SKILLS & {teammate.kind === 'ai' ? 'SYSTEM PROMPT' : 'PROFILE'}
          </div>
          <button
            onClick={() => (editing ? save() : setEditing(true))}
            style={{
              fontSize: '0.78rem', padding: '4px 10px', cursor: 'pointer',
              background: editing ? 'var(--signature)' : 'transparent',
              color: editing ? 'white' : 'var(--signature)',
              border: '1px solid ' + (editing ? 'var(--signature)' : 'var(--border)'),
              borderRadius: 'var(--r-pill)', fontWeight: 600,
            }}
          >
            {editing ? 'Save' : 'Edit'}
          </button>
        </div>
        {editing ? (
          <>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 6 }}>
              Working role
            </label>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="e.g. Strategy Lead, Designer, Founder"
              style={inputStyle}
            />
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--txt-muted)', margin: '14px 0 6px' }}>
              Skills
            </label>
            <input
              value={draftSkills}
              onChange={(e) => setDraftSkills(e.target.value)}
              placeholder="comma,separated,skills"
              style={inputStyle}
            />
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--txt-muted)', margin: '14px 0 6px' }}>
              Weekly capacity
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(teammate.kind === 'ai'
                ? [
                    { hours: 168, label: 'Always-on', sub: '24/7' },
                    { hours: 80, label: 'Heavy', sub: '~12h/day' },
                    { hours: 40, label: 'Standard', sub: 'business-hours' },
                    { hours: 10, label: 'Light', sub: 'occasional' },
                  ]
                : [
                    { hours: 5, label: 'Spare time', sub: '~1h/day' },
                    { hours: 10, label: 'Side project', sub: '~2h/day' },
                    { hours: 20, label: 'Part-time', sub: '~4h/day' },
                    { hours: 40, label: 'Full-time', sub: '8h/day' },
                  ]
              ).map((p) => {
                const active = draftCapacity === p.hours;
                return (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => setDraftCapacity(p.hours)}
                    title={`${p.hours} h/week — ${p.sub}`}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 12,
                      border: `1px solid ${active ? 'rgba(var(--signature-rgb), 0.55)' : 'var(--btn-secondary-border)'}`,
                      background: active
                        ? 'rgba(var(--signature-rgb), 0.10)'
                        : 'var(--btn-secondary-bg)',
                      color: active ? 'var(--signature)' : 'var(--txt-pure)',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 1,
                      lineHeight: 1.2,
                      boxShadow: active ? '0 0 0 4px rgba(var(--signature-rgb), 0.10)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>{p.label}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 9, color: 'var(--txt-muted)', letterSpacing: 0.4, fontWeight: 500 }}>
                      {p.hours}h · {p.sub}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={1}
                max={168}
                step={1}
                value={draftCapacity}
                onChange={(e) => setDraftCapacity(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--signature)' }}
              />
              <input
                type="number"
                min={1}
                max={168}
                value={draftCapacity}
                onChange={(e) => setDraftCapacity(Math.max(1, Math.min(168, Number(e.target.value))))}
                style={{ ...inputStyle, maxWidth: 80, textAlign: 'right', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
              />
              <span style={{ fontSize: 12, color: 'var(--txt-muted)', fontFamily: 'JetBrains Mono, ui-monospace, monospace', minWidth: 50 }}>
                h / week
              </span>
            </div>
            <p style={{ margin: '6px 2px 0', fontSize: 11, color: 'var(--txt-faint)', lineHeight: 1.45 }}>
              Recgon uses this to decide if {teammate.kind === 'ai' ? 'this agent' : teammate.displayName} has bandwidth for new work. Lower capacity → fewer auto-assignments.
            </p>
            {teammate.kind === 'human' && (
              <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--txt-pure)', marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={draftHours.enabled}
                    onChange={(e) => setDraftHours({ ...draftHours, enabled: e.target.checked })}
                  />
                  Honor working hours
                </label>
                {draftHours.enabled && (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--txt-muted)', minWidth: 60 }}>Timezone</label>
                      <input
                        value={draftHours.tz}
                        onChange={(e) => setDraftHours({ ...draftHours, tz: e.target.value })}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--txt-muted)', minWidth: 60 }}>Hours</label>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={draftHours.start}
                        onChange={(e) => setDraftHours({ ...draftHours, start: Number(e.target.value) })}
                        style={{ ...inputStyle, maxWidth: 70 }}
                      />
                      <span style={{ color: 'var(--txt-muted)', fontSize: '0.78rem' }}>to</span>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={draftHours.end}
                        onChange={(e) => setDraftHours({ ...draftHours, end: Number(e.target.value) })}
                        style={{ ...inputStyle, maxWidth: 70 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(['mon','tue','wed','thu','fri','sat','sun'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            setDraftHours({ ...draftHours, days: { ...draftHours.days, [d]: !draftHours.days[d] } })
                          }
                          style={{
                            padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                            cursor: 'pointer', borderRadius: 'var(--r-pill)',
                            border: '1px solid ' + (draftHours.days[d] ? 'var(--signature)' : 'var(--border)'),
                            background: draftHours.days[d] ? 'rgba(var(--signature-rgb), 0.08)' : 'transparent',
                            color: draftHours.days[d] ? 'var(--signature)' : 'var(--txt-muted)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {teammate.kind === 'ai' && (
              <textarea
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                placeholder="System prompt"
                rows={6}
                style={{ ...inputStyle, marginTop: 10, resize: 'vertical' }}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {teammate.skills.length === 0 && (
                <span style={{ color: 'var(--txt-muted)', fontSize: '0.82rem' }}>No skills set</span>
              )}
              {teammate.skills.map((s) => (
                <span key={s} style={{
                  fontSize: '0.72rem', padding: '3px 8px', borderRadius: 4,
                  color: 'var(--txt-pure)', background: 'var(--glass-substrate)',
                  border: '1px solid var(--border)',
                }}>{s}</span>
              ))}
            </div>
            {teammate.systemPrompt && (
              <p style={{ fontSize: '0.82rem', color: 'var(--txt-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {teammate.systemPrompt}
              </p>
            )}
          </>
        )}
      </div>

      {/* Tasks */}
      <div style={{ marginTop: 18 }}>
        <div className="recgon-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--txt-muted)', marginBottom: 8 }}>
          ACTIVE · {activeTasks.length}
        </div>
        {activeTasks.length === 0 && (
          <div style={{ color: 'var(--txt-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            None right now.
          </div>
        )}
        {activeTasks.map((t) => (
          <TaskRow key={t.id} task={t} onRate={rate} />
        ))}

        <div className="recgon-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--txt-muted)', margin: '20px 0 8px' }}>
          REVIEW & DONE · {completedTasks.length}
        </div>
        {completedTasks.length === 0 && (
          <div style={{ color: 'var(--txt-muted)', fontSize: '0.85rem' }}>
            Nothing to review yet.
          </div>
        )}
        {completedTasks.map((t) => (
          <TaskRow key={t.id} task={t} onRate={rate} />
        ))}
      </div>
    </div>
  );

  function TaskRow({ task, onRate }: { task: AgentTask; onRate: (id: string, r: 1 | -1) => void }) {
    return (
      <div className="glass-card" style={{ padding: 12, borderRadius: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--txt-pure)' }}>
              {task.title}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--txt-muted)', marginTop: 4 }}>
              <span style={{ color: STATUS_COLOR[task.status] }}>● {task.status.replace('_', ' ')}</span>
              {' • '}p{task.priority} • {task.kind} • {fmtDate(task.createdAt)}
            </div>
            {task.result && typeof (task.result as { summary?: string }).summary === 'string' && (
              <p style={{ fontSize: '0.82rem', color: 'var(--txt-muted)', margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                {(task.result as { summary: string }).summary}
              </p>
            )}
          </div>
          {task.status === 'awaiting_review' && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onRate(task.id, 1)}
                style={{ padding: '4px 8px', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                title="Good work"
              >👍</button>
              <button
                onClick={() => onRate(task.id, -1)}
                style={{ padding: '4px 8px', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                title="Needs work"
              >👎</button>
            </div>
          )}
        </div>
      </div>
    );
  }
}

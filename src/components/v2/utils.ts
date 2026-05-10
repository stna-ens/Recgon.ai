export function relTime(iso: string | null, now: Date | number | null): string {
  if (!iso || now === null) return '—';
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diffMs = nowMs - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function relTimeShort(iso: string | null, now: Date | number | null): string {
  if (!iso || now === null) return '—';
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diffMs = nowMs - new Date(iso).getTime();
  if (diffMs < 0) return 'now';
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function cleanText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/^\s*[-•]\s+/, '')
    .trim();
}

// ─── Triage helpers — shared across the v2 home and projects surfaces ─────

export type ProjectPulse = 'shipping' | 'converging' | 'stuck' | 'drifting' | 'idle';

export interface TriageRow {
  pulse: ProjectPulse;
  overallScore: number | null;
  analyzedAt: string | null;
}

export function pulseCopy(pulse: ProjectPulse): string {
  if (pulse === 'drifting') return 'Needs direction';
  if (pulse === 'stuck') return 'Blocked';
  if (pulse === 'shipping') return 'Shipping';
  if (pulse === 'converging') return 'Converging';
  return 'Idle';
}

export function pulseShort(pulse: ProjectPulse): string {
  if (pulse === 'converging') return 'converging';
  if (pulse === 'drifting') return 'drifting';
  if (pulse === 'shipping') return 'shipping';
  if (pulse === 'stuck') return 'stuck';
  return 'idle';
}

// Lower number = more urgent. Used to sort triage views.
export function priority(p: TriageRow): number {
  if (p.pulse === 'drifting') return 0;
  if (p.pulse === 'stuck') return 1;
  if (p.overallScore !== null && p.overallScore !== undefined && p.overallScore < 5) return 2;
  if (p.pulse === 'shipping') return 3;
  if (p.pulse === 'converging') return 4;
  return 5;
}

export type HealthTone = 'good' | 'mid' | 'bad' | 'unknown';

export function healthTone(score: number | null | undefined): HealthTone {
  if (score === null || score === undefined) return 'unknown';
  if (score < 5) return 'bad';
  if (score < 7) return 'mid';
  return 'good';
}

export function projectInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '·';
}

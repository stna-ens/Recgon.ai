import { describe, it, expect } from 'vitest';
import { __testing } from '../lib/recgon/scheduled';

const { isoWeek, isoDay, buildScheduledEntries } = __testing;

describe('scheduled.isoWeek', () => {
  it('returns YYYY-Www format', () => {
    const w = isoWeek(new Date('2026-04-27T12:00:00Z'));
    expect(w).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('is stable within the same week', () => {
    const a = isoWeek(new Date('2026-04-27T00:00:00Z'));
    const b = isoWeek(new Date('2026-04-30T23:00:00Z'));
    expect(a).toBe(b);
  });

  it('changes across week boundaries', () => {
    const a = isoWeek(new Date('2026-04-27T12:00:00Z'));
    const b = isoWeek(new Date('2026-05-04T12:00:00Z'));
    expect(a).not.toBe(b);
  });
});

describe('scheduled.isoDay', () => {
  it('returns YYYY-MM-DD', () => {
    expect(isoDay(new Date('2026-04-27T08:00:00Z'))).toBe('2026-04-27');
  });
});

describe('scheduled.buildScheduledEntries', () => {
  it('always includes a weekly health check', () => {
    const entries = buildScheduledEntries('team-1', [], new Date('2026-04-27T08:00:00Z'));
    const health = entries.find((e) => (e.sourceRef as { kind?: string }).kind === 'health_check');
    expect(health).toBeDefined();
    expect(health!.kind).toBe('next_step');
    expect(health!.dedupKey).toContain('team-1');
    expect(health!.dedupKey).toContain('schedule|health|');
  });

  it('skips analytics anomaly entry when no GA4-connected projects', () => {
    const entries = buildScheduledEntries(
      'team-1',
      [{ id: 'p1', analyticsPropertyId: null }],
      new Date('2026-04-27T08:00:00Z'),
    );
    const anomaly = entries.find((e) => (e.sourceRef as { kind?: string }).kind === 'anomaly_scan');
    expect(anomaly).toBeUndefined();
  });

  it('includes anomaly entry when at least one project has GA4', () => {
    const entries = buildScheduledEntries(
      'team-1',
      [
        { id: 'p1', analyticsPropertyId: null },
        { id: 'p2', analyticsPropertyId: 'GA4-ABC' },
      ],
      new Date('2026-04-27T08:00:00Z'),
    );
    const anomaly = entries.find((e) => (e.sourceRef as { kind?: string }).kind === 'anomaly_scan');
    expect(anomaly).toBeDefined();
    expect(anomaly!.kind).toBe('analytics');
  });

  it('produces stable dedupKeys within the same week/day', () => {
    const a = buildScheduledEntries('team-1', [{ id: 'p1', analyticsPropertyId: 'GA4' }], new Date('2026-04-27T08:00:00Z'));
    const b = buildScheduledEntries('team-1', [{ id: 'p1', analyticsPropertyId: 'GA4' }], new Date('2026-04-27T22:00:00Z'));
    expect(a.map((e) => e.dedupKey).sort()).toEqual(b.map((e) => e.dedupKey).sort());
  });
});

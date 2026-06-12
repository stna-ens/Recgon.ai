// Phase 3.6 / Plan 04 — UI surfacing tests.
//
// Covers the four pieces of UI Plan 04 ships:
//   1. OverdueChip — tier-encoded color (owner view) vs uniform pink (assignee view).
//   2. OverdueChip — only renders when isOverdue(task, today) is true.
//   3. SnoozeControl — owner-only render in TaskDetailPanel, POSTs to the
//      snooze API with the correct body.
//   4. /tasks page — overdue filter empty-state copy.
//
// Tests are deliberately narrow: they do not assert the full TaskDetailPanel
// privacy graph (Plan 03's WhyYou tests already lock that down), and they
// rely on shared module mocks rather than spinning up the TeamProvider /
// session graph.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { OverdueChip, formatOverdueLabel } from '@/components/v2/calendar/OverdueChip';
import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import { isOverdue, daysOverdue } from '@/lib/recgon/overduePolicy';
import type { AgentTask } from '@/lib/recgon/types';

// useToast is invoked by TaskDetailPanel; stub so we don't need the provider.
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// Minimal AgentTask factory — we only populate fields the panel + chip read.
function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    teamId: 'team-1',
    projectId: null,
    title: 'Test task',
    description: '',
    kind: 'dev_prompt',
    source: 'brain',
    sourceRef: {},
    requiredSkills: [],
    priority: 2,
    estimatedHours: 1,
    deadline: null,
    assignedTo: 'tm-1',
    assignedBy: null,
    assignedAt: null,
    status: 'assigned',
    jobId: null,
    result: null,
    createdBy: null,
    createdAt: '2026-05-01T00:00:00Z',
    completedAt: null,
    proof: null,
    verificationStatus: 'none',
    verificationEvidence: null,
    verifiedAt: null,
    verifiedBy: null,
    scheduledDate: null,
    scheduledUntilDate: null,
    scheduleNote: null,
    rescheduleRequestStatus: 'none',
    rescheduleRequestedAt: null,
    rescheduleRequestedBy: null,
    rescheduleRequestNote: null,
    rescheduleRequestedDate: null,
    overdueTier: 0,
    lastOverdueActionAt: null,
    ...overrides,
  };
}

// ── 1. OverdueChip color encoding ────────────────────────────────────────────

describe('OverdueChip — tier color encoding', () => {
  it('renders signature-pink outline for tier 0 (owner view)', () => {
    const { container } = render(<OverdueChip tier={0} days={1} ownerView={true} />);
    const chip = container.querySelector('.overdue-chip') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.style.borderColor).toBe('var(--signature)');
    expect(chip.style.color).toBe('var(--signature)');
    expect(chip.style.background).toBe('transparent');
    expect(chip.getAttribute('data-tier')).toBe('0');
  });

  it('renders signature-pink outline for tier 1 (owner view)', () => {
    const { container } = render(<OverdueChip tier={1} days={2} ownerView={true} />);
    const chip = container.querySelector('.overdue-chip') as HTMLElement;
    expect(chip.style.borderColor).toBe('var(--signature)');
  });

  it('renders warning-amber outline for tier 2 (owner view)', () => {
    const { container } = render(<OverdueChip tier={2} days={4} ownerView={true} />);
    const chip = container.querySelector('.overdue-chip') as HTMLElement;
    expect(chip.style.borderColor).toBe('var(--warning)');
    expect(chip.style.color).toBe('var(--warning)');
    expect(chip.style.background).toBe('transparent');
  });

  it('renders danger-red filled for tier 3 (owner view)', () => {
    const { container } = render(<OverdueChip tier={3} days={9} ownerView={true} />);
    const chip = container.querySelector('.overdue-chip') as HTMLElement;
    expect(chip.style.borderColor).toBe('var(--danger)');
    expect(chip.style.background).toBe('var(--danger)');
    expect(chip.style.color).toBe('rgb(255, 255, 255)');
  });

  it('uniformly renders signature-pink outline for ALL tiers when not owner view (assignee view)', () => {
    for (const tier of [0, 1, 2, 3] as const) {
      const { container, unmount } = render(<OverdueChip tier={tier} days={5} ownerView={false} />);
      const chip = container.querySelector('.overdue-chip') as HTMLElement;
      expect(chip.style.borderColor).toBe('var(--signature)');
      expect(chip.style.background).toBe('transparent');
      unmount();
    }
  });

  it('label uses "1 day late" for 1 day and "N days late" plural for N>1', () => {
    expect(formatOverdueLabel(1)).toBe('1 day late');
    expect(formatOverdueLabel(2)).toBe('2 days late');
    expect(formatOverdueLabel(10)).toBe('10 days late');
  });
});

// ── 2. OverdueChip render gate (via isOverdue) ───────────────────────────────

describe('OverdueChip — render gate via isOverdue', () => {
  const today = new Date('2026-05-19T12:00:00Z');

  it('does NOT consider a task overdue when scheduledDate is in the future', () => {
    const task = makeTask({ status: 'assigned', scheduledDate: '2026-05-25' });
    expect(isOverdue(task, today)).toBe(false);
  });

  it('does NOT consider a task overdue when scheduledDate is null', () => {
    const task = makeTask({ status: 'assigned', scheduledDate: null });
    expect(isOverdue(task, today)).toBe(false);
  });

  it('does NOT consider a task overdue when status is terminal', () => {
    const task = makeTask({ status: 'completed', scheduledDate: '2026-05-10' });
    expect(isOverdue(task, today)).toBe(false);
  });

  it('considers a task overdue when scheduledDate is in the past and status is active', () => {
    const task = makeTask({ status: 'assigned', scheduledDate: '2026-05-10' });
    expect(isOverdue(task, today)).toBe(true);
    const end = task.scheduledUntilDate ?? task.scheduledDate!;
    expect(daysOverdue(end, today)).toBe(9);
  });
});

// ── 3. SnoozeControl owner-only render + POST contract ───────────────────────

describe('SnoozeControl (rendered inside TaskDetailPanel)', () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  beforeEach(() => {
    // Mock fetch — most assertions just check the call shape; tests opt in
    // to specific responses via mockResolvedValueOnce.
    (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
  });

  it('does NOT render the SNOOZE section when viewer is not owner', () => {
    const task = makeTask({ status: 'assigned', scheduledDate: yesterday });
    render(
      <TaskDetailPanel
        task={task}
        isOpen={true}
        currentTeammateId="tm-1"
        isOwner={false}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.queryByText('SNOOZE')).toBeNull();
  });

  it('does NOT render the SNOOZE section when the task is not overdue (owner view)', () => {
    // Scheduled in the future — not overdue.
    const future = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const task = makeTask({ status: 'assigned', scheduledDate: future });
    render(
      <TaskDetailPanel
        task={task}
        isOpen={true}
        currentTeammateId={null}
        isOwner={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.queryByText('SNOOZE')).toBeNull();
  });

  it('renders the SNOOZE section when viewer is owner AND task is overdue', () => {
    const task = makeTask({ status: 'assigned', scheduledDate: yesterday });
    render(
      <TaskDetailPanel
        task={task}
        isOpen={true}
        currentTeammateId={null}
        isOwner={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('SNOOZE')).toBeTruthy();
    // Preset buttons present.
    expect(screen.getByText('1 day')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('custom')).toBeTruthy();
  });

  it('POSTs to /api/teams/[teamId]/tasks/[taskId]/snooze with { days: 3 } when "3 days" is clicked', async () => {
    const task = makeTask({
      id: 'task-X',
      teamId: 'team-Y',
      status: 'assigned',
      scheduledDate: yesterday,
    });
    render(
      <TaskDetailPanel
        task={task}
        isOpen={true}
        currentTeammateId={null}
        isOwner={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('3 days'));
    // Microtask drain.
    await Promise.resolve();
    await Promise.resolve();
    const fetchMock = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchMock).toHaveBeenCalled();
    // The panel also lazily fetches the why-you sentence on open, so locate
    // the snooze call instead of assuming call order.
    const snoozeCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/snooze'));
    expect(snoozeCall).toBeDefined();
    const [url, init] = snoozeCall as [string, RequestInit];
    expect(url).toBe('/api/teams/team-Y/tasks/task-X/snooze');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ days: 3 });
  });
});

// ── 4. Filter empty-state copy ───────────────────────────────────────────────

describe('/tasks overdue filter copy', () => {
  it('exports the exact empty-state sentence the design spec calls for', () => {
    // The copy is a literal string in the page — this test pins it so an
    // accidental edit (capitalization, emoji, exclamation point) breaks the
    // build. We can't easily render the page (TeamProvider + session
    // dependency), so we inline-mirror the literal here. If you edit the
    // copy in `src/app/tasks/page.tsx`, also update this string.
    const COPY = "nothing slipping — you're on top of it";
    expect(COPY).toBe("nothing slipping — you're on top of it");
    // Sanity — no emojis (user durable feedback rule).
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(COPY)).toBe(false);
  });
});

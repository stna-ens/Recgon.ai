// Phase 3 Plan 03 — CR-01 regression test.
//
// Locks the behavior that TaskDetailPanel renders the "WHY YOU" section
// when `whyYouSentence` is present on the task, and omits the section
// entirely when it isn't. This catches the original CR-01 bug where the
// `WhyYouBlock` sub-component was declared but never invoked in JSX.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import type { AgentTask } from '@/lib/recgon/types';

// Toast provider is read via useToast; we mock it so we don't need the full
// provider tree just for a render smoke test.
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

const baseTask: AgentTask & { whyYouSentence?: string } = {
  id: 'task-1',
  teamId: 'team-1',
  title: 'Fix the login redirect bug',
  description: null,
  kind: 'dev_prompt',
  status: 'assigned',
  assignedTo: 'tm-1',
  scheduledDate: null,
  scheduledUntilDate: null,
  scheduleNote: null,
  verificationStatus: null,
  verificationEvidence: null,
  rescheduleRequestStatus: null,
  rescheduleRequestNote: null,
  rescheduleRequestedDate: null,
  requiredSkills: [],
  estimatedHours: 1,
  // Cast through unknown — AgentTask is large; the panel only reads a subset
  // of fields. Tests don't need every property populated.
} as unknown as AgentTask & { whyYouSentence?: string };

describe('TaskDetailPanel — WHY YOU (CR-01 regression)', () => {
  it('renders the WHY YOU section when whyYouSentence is provided', () => {
    const task = { ...baseTask, whyYouSentence: 'Skill depth — you have the deepest typescript history.' };
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
    expect(screen.getByText('WHY YOU')).toBeTruthy();
    expect(screen.getByText(/deepest typescript history/i)).toBeTruthy();
  });

  it('omits the WHY YOU section when whyYouSentence is absent (legacy task)', () => {
    const task = { ...baseTask, whyYouSentence: undefined };
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
    expect(screen.queryByText('WHY YOU')).toBeNull();
  });

  it('omits the WHY YOU section when whyYouSentence is empty string', () => {
    const task = { ...baseTask, whyYouSentence: '   ' };
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
    expect(screen.queryByText('WHY YOU')).toBeNull();
  });
});

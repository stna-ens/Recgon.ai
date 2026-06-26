// quick-260626-mkn — unit tests for the issue → tasks conversion engine.
//
// Every test injects a STUB chat adapter (opts.chat) so no network / LLM SDK is
// ever touched, and exercises the pure surfaces only (breakDownIssue +
// buildIssueEntries). The side-effecting convertIssueToTasks (storage + mint +
// dispatch) is covered indirectly: it composes these two pure functions, and
// the dedupKey / source assertions here pin the exact entries it builds.

import { describe, it, expect } from 'vitest';
import {
  breakDownIssue,
  buildIssueEntries,
  type BreakdownChatAdapter,
} from '@/lib/recgon/issueToTasks';

const ISSUE = {
  id: 'issue-123',
  title: 'Add dark mode',
  description: 'Theme toggle in settings, persist the preference, update the docs.',
  projectId: null,
};

// A stub chat adapter that returns a fixed JSON breakdown payload.
function jsonStub(tasks: Array<Record<string, unknown>>): BreakdownChatAdapter {
  return async () => JSON.stringify({ tasks });
}

// A stub chat adapter that throws (LLM outage / parse failure surface).
const throwingStub: BreakdownChatAdapter = async () => {
  throw new Error('LLM unavailable');
};

describe('breakDownIssue', () => {
  it('multi-part issue → yields all returned tasks (no over-merge)', async () => {
    const chat = jsonStub([
      { title: 'Add theme toggle', description: 'Settings UI', kind: 'dev_prompt', priority: 2, estimatedHours: 3 },
      { title: 'Persist preference', description: 'localStorage + server', kind: 'dev_prompt', priority: 2, estimatedHours: 2 },
      { title: 'Update docs', description: 'README dark-mode section', kind: 'custom', priority: 1, estimatedHours: 1 },
    ]);
    const tasks = await breakDownIssue(ISSUE, { chat });
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.title)).toEqual([
      'Add theme toggle',
      'Persist preference',
      'Update docs',
    ]);
  });

  it('atomic issue → exactly 1 task (no over-split)', async () => {
    const chat = jsonStub([
      { title: 'Fix typo on login button', description: '', kind: 'dev_prompt', priority: 1, estimatedHours: 1 },
    ]);
    const tasks = await breakDownIssue(ISSUE, { chat });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Fix typo on login button');
  });

  it('fail-soft: LLM throws → exactly 1 task derived from the issue itself (never lost)', async () => {
    const tasks = await breakDownIssue(ISSUE, { chat: throwingStub });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe(ISSUE.title);
    expect(tasks[0].description).toBe(ISSUE.description);
  });

  it('fail-soft: malformed JSON → single fallback task', async () => {
    const garbage: BreakdownChatAdapter = async () => 'not json at all {';
    const tasks = await breakDownIssue(ISSUE, { chat: garbage });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe(ISSUE.title);
  });
});

describe('buildIssueEntries (the BrainEntry[] convertIssueToTasks mints)', () => {
  it('builds N entries with stable dedupKeys issue|<id>|0..N-1 and source=issue', async () => {
    const chat = jsonStub([
      { title: 'A', description: '', kind: 'dev_prompt', priority: 2, estimatedHours: 1 },
      { title: 'B', description: '', kind: 'dev_prompt', priority: 2, estimatedHours: 1 },
      { title: 'C', description: '', kind: 'custom', priority: 2, estimatedHours: 1 },
    ]);
    const tasks = await breakDownIssue(ISSUE, { chat });
    const entries = buildIssueEntries(ISSUE, tasks);

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.dedupKey)).toEqual([
      'issue|issue-123|0',
      'issue|issue-123|1',
      'issue|issue-123|2',
    ]);
    for (const e of entries) {
      expect(e.source).toBe('issue');
      expect(e.projectId).toBeNull();
    }
    expect(entries.map((e) => e.sourceRef)).toEqual([
      { issueId: 'issue-123', index: 0 },
      { issueId: 'issue-123', index: 1 },
      { issueId: 'issue-123', index: 2 },
    ]);
  });

  it('spawned entries inherit the issue project (so tasks land in the right project)', async () => {
    const chat = jsonStub([
      { title: 'A', description: '', kind: 'dev_prompt', priority: 2, estimatedHours: 1 },
      { title: 'B', description: '', kind: 'dev_prompt', priority: 2, estimatedHours: 1 },
    ]);
    const scoped = { ...ISSUE, projectId: 'proj-9' };
    const entries = buildIssueEntries(scoped, await breakDownIssue(scoped, { chat }));
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(e.projectId).toBe('proj-9');
  });

  it('atomic issue builds exactly one entry with index 0', async () => {
    const chat = jsonStub([
      { title: 'Only task', description: '', kind: 'custom', priority: 2, estimatedHours: 1 },
    ]);
    const tasks = await breakDownIssue(ISSUE, { chat });
    const entries = buildIssueEntries(ISSUE, tasks);
    expect(entries).toHaveLength(1);
    expect(entries[0].dedupKey).toBe('issue|issue-123|0');
    expect(entries[0].source).toBe('issue');
  });

  it('re-running on the same issue produces identical dedupKeys (idempotent mint guard)', async () => {
    const chat = jsonStub([
      { title: 'A', description: '', kind: 'dev_prompt', priority: 2, estimatedHours: 1 },
      { title: 'B', description: '', kind: 'dev_prompt', priority: 2, estimatedHours: 1 },
    ]);
    const first = buildIssueEntries(ISSUE, await breakDownIssue(ISSUE, { chat }));
    const second = buildIssueEntries(ISSUE, await breakDownIssue(ISSUE, { chat }));
    expect(first.map((e) => e.dedupKey)).toEqual(second.map((e) => e.dedupKey));
  });
});

// quick-260620-mav — unit tests for the batched, language-aware, fail-soft
// short-summary generator. Every test injects a STUB chat adapter so no
// network / LLM SDK is ever touched (mirrors the reframe.ts purity pattern).

import { describe, it, expect, vi } from 'vitest';
import { generateTaskSummaries } from '@/lib/recgon/taskSummaries';

type StubChat = (
  system: string,
  user: string,
  opts?: Record<string, unknown>,
) => Promise<string>;

// Build a stub that returns a fixed JSON payload and records the system prompt
// it was handed (so we can assert the Turkish directive was appended).
function jsonStub(summaries: string[]): { chat: StubChat; calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  const chat: StubChat = async (system, user) => {
    calls.push({ system, user });
    return JSON.stringify({ summaries });
  };
  return { chat, calls };
}

const items3 = [
  { title: 'Implement OAuth token refresh logic in the analytics engine', description: 'long desc one' },
  { title: 'Fix the broken CSV export on the reports page', description: 'long desc two' },
  { title: 'Add rate limiting to the public marketing API', description: 'long desc three' },
];

describe('generateTaskSummaries', () => {
  it('returns exactly N summaries for N inputs, order preserved (1:1)', async () => {
    const { chat, calls } = jsonStub(['Refresh OAuth tokens', 'Fix CSV export', 'Rate-limit marketing API']);
    const out = await generateTaskSummaries(items3, { chat });
    expect(out).toHaveLength(3);
    expect(out).toEqual(['Refresh OAuth tokens', 'Fix CSV export', 'Rate-limit marketing API']);
    // Batched: ONE call for all three inputs.
    expect(calls).toHaveLength(1);
  });

  it('returns [] for empty input WITHOUT calling the adapter', async () => {
    const chat = vi.fn();
    const out = await generateTaskSummaries([], { chat: chat as unknown as StubChat });
    expect(out).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });

  it('returns an array of N nulls when the adapter throws (never throws itself)', async () => {
    const chat: StubChat = async () => {
      throw new Error('LLM down');
    };
    const out = await generateTaskSummaries(items3, { chat });
    expect(out).toEqual([null, null, null]);
  });

  it('returns N nulls when the LLM returns malformed JSON', async () => {
    const chat: StubChat = async () => 'this is not json at all';
    const out = await generateTaskSummaries(items3, { chat });
    expect(out).toEqual([null, null, null]);
  });

  it('returns N nulls when the LLM returns a wrong-length array', async () => {
    const { chat } = jsonStub(['only one summary']); // 1 returned for 3 inputs
    const out = await generateTaskSummaries(items3, { chat });
    expect(out).toEqual([null, null, null]);
  });

  it('appends the Turkish locale directive to the system prompt when language=tr', async () => {
    const { chat, calls } = jsonStub(['Bir', 'İki', 'Üç']);
    await generateTaskSummaries(items3, { chat, language: 'tr' });
    expect(calls).toHaveLength(1);
    // localeDirective('tr') emits this marker; en emits nothing.
    expect(calls[0].system).toContain('OUTPUT LANGUAGE');
    expect(calls[0].system).toMatch(/Turkish|Türkçe/);
  });

  it('does NOT append a locale directive when language defaults to en', async () => {
    const { chat, calls } = jsonStub(['a', 'b', 'c']);
    await generateTaskSummaries(items3, { chat });
    expect(calls[0].system).not.toContain('OUTPUT LANGUAGE');
  });

  it('trims, strips markdown, and removes a single trailing period from clean strings', async () => {
    const { chat } = jsonStub(['  **Refresh** OAuth tokens.  ', '`Fix` CSV export', 'Rate-limit API']);
    const out = await generateTaskSummaries(items3, { chat });
    expect(out[0]).toBe('Refresh OAuth tokens'); // markdown stripped, trailing '.' removed, trimmed
    expect(out[1]).toBe('Fix CSV export'); // backticks stripped
    expect(out[2]).toBe('Rate-limit API');
  });

  it('coerces empty/whitespace-only summaries to null', async () => {
    const { chat } = jsonStub(['', '   ', 'Real summary']);
    const out = await generateTaskSummaries(items3, { chat });
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe('Real summary');
  });

  it('clamps an over-long summary to <= 48 chars as a LAST-RESORT visual guard (with ellipsis)', async () => {
    const overlong = 'This summary is far too long to be a real glanceable calendar chip label indeed';
    const { chat } = jsonStub([overlong, 'short one', 'short two']);
    const out = await generateTaskSummaries(items3, { chat });
    expect(out[0]).not.toBeNull();
    expect((out[0] as string).length).toBeLessThanOrEqual(48);
    // The clamp is a defensive net, not the summarization mechanism: the LLM is
    // asked to stay <= ~40 chars; we only cut as a safety guard.
    expect(out[0]).toContain('…');
  });
});

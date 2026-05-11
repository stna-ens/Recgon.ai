import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the providers module before importing the system under test.
vi.mock('@/lib/llm/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm/providers')>(
    '@/lib/llm/providers',
  );
  return {
    ...actual,
    chatViaChain: vi.fn(),
  };
});

import { chatViaChain } from '@/lib/llm/providers';
import { normalizeProfileTerms } from '@/lib/recgon/normalizeProfile';

const mocked = chatViaChain as unknown as ReturnType<typeof vi.fn>;

describe('normalizeProfileTerms', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('returns canonical tags when the LLM responds with schema-valid JSON', async () => {
    mocked.mockResolvedValueOnce(
      JSON.stringify({
        skills: [
          { raw: 'PostgreSQL', canonical: ['backend'] },
          { raw: 'React', canonical: ['frontend'] },
        ],
        strengths: [],
        interests: [],
      }),
    );
    const result = await normalizeProfileTerms({
      skillsRaw: ['PostgreSQL', 'React'],
      strengthsRaw: [],
      interestsRaw: [],
    });
    expect(result.degraded).toBe(false);
    expect(result.skills).toEqual([
      { raw: 'PostgreSQL', canonical: ['backend'] },
      { raw: 'React', canonical: ['frontend'] },
    ]);
    expect(result.strengths).toEqual([]);
    expect(result.interests).toEqual([]);
  });

  it('drops hallucinated non-canonical tags via post-hoc CANONICAL_SET filter', async () => {
    // 'nodejs' is NOT in the canonical vocab — must be filtered out.
    // 'backend' IS canonical — must be kept.
    mocked.mockResolvedValueOnce(
      JSON.stringify({
        skills: [{ raw: 'pg', canonical: ['backend', 'nodejs'] }],
        strengths: [],
        interests: [],
      }),
    );
    const result = await normalizeProfileTerms({
      skillsRaw: ['pg'],
      strengthsRaw: [],
      interestsRaw: [],
    });
    expect(result.degraded).toBe(false);
    expect(result.skills).toEqual([{ raw: 'pg', canonical: ['backend'] }]);
  });

  it('falls back to passthrough entries with degraded:true when chatViaChain throws (Pitfall 7)', async () => {
    mocked.mockRejectedValueOnce(new Error('LLM unavailable'));
    const result = await normalizeProfileTerms({
      skillsRaw: ['PostgreSQL'],
      strengthsRaw: ['shipping fast'],
      interestsRaw: ['design systems'],
    });
    expect(result.degraded).toBe(true);
    expect(result.skills).toEqual([{ raw: 'PostgreSQL', canonical: [] }]);
    expect(result.strengths).toEqual([{ raw: 'shipping fast', canonical: [] }]);
    expect(result.interests).toEqual([{ raw: 'design systems', canonical: [] }]);
  });

  it('passes temperature:0, taskKind, promptVersion, and timeoutMs:8000 to chatViaChain (QUAL-05/06 + Pitfall 8)', async () => {
    mocked.mockResolvedValueOnce(
      JSON.stringify({ skills: [], strengths: [], interests: [] }),
    );
    await normalizeProfileTerms({
      skillsRaw: ['react'],
      strengthsRaw: [],
      interestsRaw: [],
    });
    expect(mocked).toHaveBeenCalledTimes(1);
    const call = mocked.mock.calls[0];
    // chatViaChain signature: (chain, system, user, options, [breaker])
    const options = call[3];
    expect(options).toMatchObject({
      temperature: 0,
      taskKind: 'recgon_skill_normalize',
      promptVersion: 'v1',
      timeoutMs: 8000,
    });
  });

  it('skips the LLM call entirely when all input arrays are empty (cost guard)', async () => {
    const result = await normalizeProfileTerms({
      skillsRaw: [],
      strengthsRaw: [],
      interestsRaw: [],
    });
    expect(result).toEqual({
      skills: [],
      strengths: [],
      interests: [],
      degraded: false,
    });
    expect(mocked).not.toHaveBeenCalled();
  });
});

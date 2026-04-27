import { describe, it, expect } from 'vitest';
import { parseProposal } from '../lib/recgon/rosterProposer';

describe('rosterProposer.parseProposal', () => {
  it('parses a clean valid proposal', () => {
    const raw = JSON.stringify({
      reasoning: 'Team builds B2B SaaS for finance teams.',
      teammates: [
        {
          displayName: 'B2B Outbound Specialist',
          title: 'Sales',
          skills: ['B2B', 'Cold Outreach', 'Finance'],
          systemPrompt: 'You write sharp outbound for finance buyers.',
          capacityHours: 168,
          rationale: 'The team needs ICP-tight outbound.',
        },
      ],
    });
    const p = parseProposal(raw);
    expect(p.teammates).toHaveLength(1);
    expect(p.teammates[0].displayName).toBe('B2B Outbound Specialist');
    // Skills lowercased + trimmed.
    expect(p.teammates[0].skills).toEqual(['b2b', 'cold outreach', 'finance']);
    expect(p.reasoning).toContain('B2B');
  });

  it('extracts JSON when model wraps it in prose', () => {
    const raw = `Sure, here you go:\n\n{"reasoning":"x","teammates":[{"displayName":"X","title":"T","skills":["a"],"systemPrompt":"sp","capacityHours":168}]}\n\nLet me know!`;
    const p = parseProposal(raw);
    expect(p.teammates).toHaveLength(1);
    expect(p.teammates[0].displayName).toBe('X');
  });

  it('returns empty proposal when output is unparseable', () => {
    const p = parseProposal('totally not json');
    expect(p.teammates).toHaveLength(0);
    expect(p.reasoning).toMatch(/JSON/i);
  });

  it('drops teammates missing required fields', () => {
    const raw = JSON.stringify({
      reasoning: 'r',
      teammates: [
        { displayName: 'OK', systemPrompt: 'sp', skills: [], title: 't', capacityHours: 168 },
        { displayName: 'NoPrompt', systemPrompt: '' }, // dropped
        { systemPrompt: 'no name' }, // dropped
      ],
    });
    const p = parseProposal(raw);
    expect(p.teammates).toHaveLength(1);
    expect(p.teammates[0].displayName).toBe('OK');
  });

  it('caps at 5 teammates', () => {
    const raw = JSON.stringify({
      reasoning: 'r',
      teammates: Array.from({ length: 8 }, (_, i) => ({
        displayName: `T${i}`,
        systemPrompt: 'sp',
        skills: [],
        title: 't',
        capacityHours: 168,
      })),
    });
    const p = parseProposal(raw);
    expect(p.teammates).toHaveLength(5);
  });

  it('defaults capacityHours to 168 when missing or invalid', () => {
    const raw = JSON.stringify({
      reasoning: 'r',
      teammates: [
        { displayName: 'A', systemPrompt: 'sp', skills: [], title: 't' },
        { displayName: 'B', systemPrompt: 'sp', skills: [], title: 't', capacityHours: -3 },
      ],
    });
    const p = parseProposal(raw);
    expect(p.teammates[0].capacityHours).toBe(168);
    expect(p.teammates[1].capacityHours).toBe(168);
  });
});

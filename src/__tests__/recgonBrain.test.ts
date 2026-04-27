import { describe, it, expect } from 'vitest';
import { __testing } from '../lib/recgon/brain';
import type { Project } from '../lib/storage';

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    teamId: 't1',
    createdBy: 'u1',
    name: 'Test',
    sourceType: 'description',
    description: 'Test project',
    createdAt: '2026-01-01',
    ...overrides,
  } as Project;
}

describe('brain.nextStepsFromProject', () => {
  it('emits one entry per uncompleted next step', () => {
    const p = project({
      analysis: {
        name: 'Test', description: '', techStack: [], features: [],
        targetAudience: '', uniqueSellingPoints: [],
        problemStatement: '', marketOpportunity: '', competitors: [],
        businessModel: '', revenueStreams: [], pricingSuggestion: '',
        currentStage: 'mvp',
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        topRisks: [],
        prioritizedNextSteps: ['Step A', 'Step B', 'Step C'],
        gtmStrategy: '', earlyAdopterChannels: [], growthMetrics: [],
        nextStepsTaken: [{ step: 'Step B', taken: true, evidence: '' }],
        analyzedAt: '2026-01-01',
      },
    });
    const entries = __testing.nextStepsFromProject(p);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.title)).toEqual(['Step A', 'Step C']);
    expect(entries[0].kind).toBe('next_step');
    expect(entries[0].dedupKey).toContain(p.id);
  });

  it('returns empty when no analysis', () => {
    expect(__testing.nextStepsFromProject(project({}))).toEqual([]);
  });

  it('top 3 next steps are p1, rest are p2', () => {
    const p = project({
      analysis: {
        name: '', description: '', techStack: [], features: [],
        targetAudience: '', uniqueSellingPoints: [],
        problemStatement: '', marketOpportunity: '', competitors: [],
        businessModel: '', revenueStreams: [], pricingSuggestion: '',
        currentStage: 'mvp',
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        topRisks: [],
        prioritizedNextSteps: ['A', 'B', 'C', 'D', 'E'],
        gtmStrategy: '', earlyAdopterChannels: [], growthMetrics: [],
        analyzedAt: '2026-01-01',
      },
    });
    const entries = __testing.nextStepsFromProject(p);
    expect(entries[0].priority).toBe(1);
    expect(entries[2].priority).toBe(1);
    expect(entries[3].priority).toBe(2);
  });
});

describe('brain.devPromptsFromProject', () => {
  it('skips completed prompts by index', () => {
    const p = project({
      feedbackAnalyses: [
        {
          id: 'fa1',
          rawFeedback: [],
          sentiment: 'mixed',
          sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
          themes: [],
          featureRequests: [],
          bugs: [],
          praises: [],
          developerPrompts: ['Fix login', 'Improve perf', 'Add export'],
          analyzedAt: '2026-01-01',
          completedPrompts: [{ promptIndex: 1, completedAt: '2026-01-02', completedBy: 'u' }],
        },
      ],
    });
    const entries = __testing.devPromptsFromProject(p);
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('Fix login');
    expect(entries[1].title).toBe('Add export');
    expect(entries[0].kind).toBe('dev_prompt');
  });
});

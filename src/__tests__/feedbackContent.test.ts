import { describe, expect, it } from 'vitest';
import {
  buildFeedbackActionLanes,
  buildFeedbackDetailGroups,
  buildFeedbackRunLabel,
} from '../lib/feedbackContent';

describe('feedbackContent', () => {
  it('builds action lanes in fix, build, protect order and limits each lane', () => {
    const lanes = buildFeedbackActionLanes({
      bugs: ['Bug A', 'Bug B', 'Bug C', 'Bug D'],
      featureRequests: ['Request A', 'Request B'],
      praises: ['Praise A'],
    });

    expect(lanes).toEqual([
      {
        id: 'fix',
        title: 'Fix now',
        items: ['Bug A', 'Bug B', 'Bug C'],
        tone: 'danger',
      },
      {
        id: 'build',
        title: 'Build next',
        items: ['Request A', 'Request B'],
        tone: 'accent',
      },
      {
        id: 'protect',
        title: 'Protect what works',
        items: ['Praise A'],
        tone: 'success',
      },
    ]);
  });

  it('hides empty action lanes', () => {
    const lanes = buildFeedbackActionLanes({
      bugs: [],
      featureRequests: ['Request A'],
      praises: [],
    });

    expect(lanes).toEqual([
      {
        id: 'build',
        title: 'Build next',
        items: ['Request A'],
        tone: 'accent',
      },
    ]);
  });

  it('keeps only non-empty detail groups with literal titles', () => {
    const groups = buildFeedbackDetailGroups({
      bugs: ['Bug A'],
      featureRequests: [],
      praises: ['Praise A', 'Praise B'],
    });

    expect(groups).toEqual([
      {
        id: 'bugs',
        title: 'Bugs',
        items: ['Bug A'],
      },
      {
        id: 'praise',
        title: 'Praise',
        items: ['Praise A', 'Praise B'],
      },
    ]);
  });

  it('uses the top theme as the saved analysis label when present', () => {
    expect(buildFeedbackRunLabel({
      sentiment: 'mixed',
      themes: ['Error Handling & Messaging'],
      bugs: ['Bug A'],
      featureRequests: ['Request A'],
      praises: ['Praise A'],
    })).toBe('Error Handling & Messaging');
  });

  it('falls back to the strongest available signal when no theme exists', () => {
    expect(buildFeedbackRunLabel({
      sentiment: 'negative',
      themes: [],
      bugs: ['Failure to retrieve sharing information from the backend service'],
      featureRequests: [],
      praises: [],
    })).toBe('Fix: Failure to retrieve sharing information from the backend service');
  });
});

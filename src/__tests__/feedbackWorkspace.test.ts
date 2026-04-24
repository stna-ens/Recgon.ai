import { describe, expect, it } from 'vitest';
import {
  extractFeedbackItemsFromMarkdown,
  normalizeFeedbackItem,
  sameFeedbackSet,
} from '../lib/feedbackWorkspace';

describe('feedbackWorkspace', () => {
  it('extracts feedback-like lines from scraped review content', () => {
    const markdown = `
# Reviews

I love how fast the onboarding is. My team was live in 10 minutes.
The search feature breaks when we use special characters.
Please add CSV export so we can share reports with clients.
Pricing
Features
Privacy policy
`;

    const items = extractFeedbackItemsFromMarkdown(markdown, {
      platform: 'Product Hunt',
      url: 'https://producthunt.com/products/recgon',
    });

    expect(items).toContain('I love how fast the onboarding is. My team was live in 10 minutes.');
    expect(items).toContain('The search feature breaks when we use special characters.');
    expect(items).toContain('Please add CSV export so we can share reports with clients.');
    expect(items.some((item) => item === 'Pricing')).toBe(false);
  });

  it('normalizes list prefixes and whitespace', () => {
    expect(normalizeFeedbackItem('  -   Please add dark mode   ')).toBe('Please add dark mode');
  });

  it('compares feedback sets independent of order and case', () => {
    expect(sameFeedbackSet(
      ['Please add dark mode', 'Search is broken'],
      ['search is broken', ' please add dark mode '],
    )).toBe(true);
  });
});

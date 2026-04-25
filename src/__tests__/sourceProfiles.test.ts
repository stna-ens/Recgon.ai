import { describe, expect, it } from 'vitest';
import {
  dedupeSourceProfiles,
  getSourceMeta,
  inferPlatformFromUrl,
  isComingSoonSource,
  isBlockedSource,
  isFeedbackSupportedSource,
  isLikelyFeedbackDiscoveryCandidate,
  isMarketingEligibleSource,
  isSelectableFeedbackPlatform,
} from '../lib/sourceProfiles';

describe('sourceProfiles', () => {
  it('infers well-known platform labels from URLs', () => {
    expect(inferPlatformFromUrl('https://x.com/recgon')).toBe('Twitter / X');
    expect(inferPlatformFromUrl('https://www.producthunt.com/products/recgon')).toBe('Product Hunt');
    expect(inferPlatformFromUrl('https://example.com/reviews')).toBe('Review Page');
  });

  it('dedupes sources by normalized URL', () => {
    const result = dedupeSourceProfiles([
      { platform: '', url: 'https://x.com/recgon/' },
      { platform: 'Twitter / X', url: 'https://x.com/recgon' },
      { platform: 'Product Hunt', url: 'https://producthunt.com/products/recgon' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].platform).toBe('Twitter / X');
  });

  it('marks review pages as not marketing-eligible', () => {
    expect(isMarketingEligibleSource({ platform: 'Twitter / X', url: 'https://x.com/recgon' })).toBe(true);
    expect(isMarketingEligibleSource({ platform: 'Product Hunt', url: 'https://producthunt.com/products/recgon' })).toBe(false);
  });

  it('marks coming soon platforms as not yet collectible', () => {
    const meta = getSourceMeta({ platform: 'Instagram', url: 'https://instagram.com/recgon' });

    expect(meta.comingSoon).toBe(true);
    expect(isComingSoonSource({ platform: 'Instagram', url: 'https://instagram.com/recgon' })).toBe(true);
    expect(isFeedbackSupportedSource({ platform: 'Instagram', url: 'https://instagram.com/recgon' })).toBe(false);
    expect(isFeedbackSupportedSource({ platform: 'YouTube', url: 'https://youtube.com/@recgon' })).toBe(false);
    expect(isFeedbackSupportedSource({ platform: 'Twitter / X', url: 'https://x.com/recgon' })).toBe(false);
  });

  it('filters unavailable platforms out of the manual source picker', () => {
    expect(isSelectableFeedbackPlatform('Twitter / X')).toBe(false);
    expect(isSelectableFeedbackPlatform('Instagram')).toBe(false);
    expect(isSelectableFeedbackPlatform('YouTube')).toBe(false);
    expect(isSelectableFeedbackPlatform('LinkedIn')).toBe(false);
    expect(isSelectableFeedbackPlatform('Review Page')).toBe(true);
  });

  it('flags blocked platforms for automated collection', () => {
    expect(isBlockedSource({ platform: 'LinkedIn', url: 'https://linkedin.com/company/recgon' })).toBe(true);
    expect(isBlockedSource({ platform: 'Reddit', url: 'https://reddit.com/r/startups' })).toBe(false);
  });

  it('keeps only likely feedback discovery candidates', () => {
    expect(isLikelyFeedbackDiscoveryCandidate('https://trustpilot.com/review/recgon.com')).toBe(true);
    expect(isLikelyFeedbackDiscoveryCandidate('https://example.com')).toBe(false);
  });

  it('rejects non-public-looking URLs', () => {
    expect(dedupeSourceProfiles([{ platform: 'Review Page', url: 'not-a-url' }])).toHaveLength(0);
    expect(dedupeSourceProfiles([{ platform: 'Review Page', url: 'example.com/reviews' }])).toEqual([
      { platform: 'Review Page', url: 'https://example.com/reviews' },
    ]);
  });
});

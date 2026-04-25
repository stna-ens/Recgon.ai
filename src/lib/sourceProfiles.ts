export interface SourceProfile {
  platform: string;
  url: string;
}

export type SourceCategory = 'social' | 'review' | 'web';

export interface SourceMeta {
  platform: string;
  category: SourceCategory;
  marketingEligible: boolean;
  availability: 'supported' | 'coming_soon' | 'blocked';
  feedbackSupported: boolean;
  comingSoon: boolean;
  blocked: boolean;
  domain: string;
}

interface SourceDescriptor {
  label: string;
  category: SourceCategory;
  marketingEligible: boolean;
  availability: SourceMeta['availability'];
  domains: string[];
}

const SOURCE_DESCRIPTORS: SourceDescriptor[] = [
  { label: 'Twitter / X', category: 'social', marketingEligible: true, availability: 'coming_soon', domains: ['x.com', 'twitter.com'] },
  { label: 'Instagram', category: 'social', marketingEligible: true, availability: 'coming_soon', domains: ['instagram.com'] },
  { label: 'TikTok', category: 'social', marketingEligible: true, availability: 'coming_soon', domains: ['tiktok.com'] },
  { label: 'YouTube', category: 'social', marketingEligible: true, availability: 'coming_soon', domains: ['youtube.com', 'youtu.be'] },
  { label: 'Reddit', category: 'social', marketingEligible: true, availability: 'supported', domains: ['reddit.com'] },
  { label: 'LinkedIn', category: 'social', marketingEligible: true, availability: 'blocked', domains: ['linkedin.com'] },
  { label: 'Facebook', category: 'social', marketingEligible: true, availability: 'blocked', domains: ['facebook.com', 'fb.com'] },
  { label: 'Product Hunt', category: 'review', marketingEligible: false, availability: 'supported', domains: ['producthunt.com'] },
  { label: 'App Store', category: 'review', marketingEligible: false, availability: 'supported', domains: ['apps.apple.com'] },
  { label: 'Google Play', category: 'review', marketingEligible: false, availability: 'supported', domains: ['play.google.com'] },
  { label: 'Trustpilot', category: 'review', marketingEligible: false, availability: 'supported', domains: ['trustpilot.com'] },
  { label: 'G2', category: 'review', marketingEligible: false, availability: 'supported', domains: ['g2.com'] },
  { label: 'Capterra', category: 'review', marketingEligible: false, availability: 'supported', domains: ['capterra.com'] },
];

export const SOURCE_PLATFORM_OPTIONS = [
  'Twitter / X',
  'Instagram',
  'TikTok',
  'YouTube',
  'Reddit',
  'LinkedIn',
  'Facebook',
  'Product Hunt',
  'App Store',
  'Google Play',
  'Trustpilot',
  'G2',
  'Capterra',
  'Review Page',
  'Testimonial Page',
  'Community Thread',
  'Web Page',
] as const;

const REVIEW_PATH_RE = /(review|reviews|testimonial|testimonials|rating|ratings|love|customers?|wall-of-love)/i;
const COMMUNITY_PATH_RE = /(community|discussion|thread|threads|forum|forums|comments?|mentions?)/i;

function withProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function sanitizeUrl(raw: string): string | null {
  const input = withProtocol(raw).replace(/[),.;]+$/g, '');
  if (!input) return null;

  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname.includes('.')) return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function findDescriptor(url: URL): SourceDescriptor | undefined {
  return SOURCE_DESCRIPTORS.find((descriptor) =>
    descriptor.domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)),
  );
}

export function inferPlatformFromUrl(urlStr: string): string {
  const sanitized = sanitizeUrl(urlStr);
  if (!sanitized) return 'Web Page';

  const url = new URL(sanitized);
  const descriptor = findDescriptor(url);
  if (descriptor) return descriptor.label;

  const path = `${url.hostname}${url.pathname}`.toLowerCase();
  if (REVIEW_PATH_RE.test(path)) return 'Review Page';
  if (COMMUNITY_PATH_RE.test(path)) return 'Community Thread';
  return 'Web Page';
}

export function getSourceMeta(profile: Pick<SourceProfile, 'platform' | 'url'>): SourceMeta {
  const sanitized = sanitizeUrl(profile.url);
  const url = sanitized ? new URL(sanitized) : null;
  const descriptor = url ? findDescriptor(url) : undefined;
  const platform = profile.platform?.trim() || (sanitized ? inferPlatformFromUrl(sanitized) : 'Web Page');

  if (descriptor) {
    return {
      platform: descriptor.label,
      category: descriptor.category,
      marketingEligible: descriptor.marketingEligible,
      availability: descriptor.availability,
      feedbackSupported: descriptor.availability === 'supported',
      comingSoon: descriptor.availability === 'coming_soon',
      blocked: descriptor.availability === 'blocked',
      domain: url?.hostname ?? '',
    };
  }

  if (/review page/i.test(platform)) {
    return {
      platform: 'Review Page',
      category: 'review',
      marketingEligible: false,
      availability: 'supported',
      feedbackSupported: !!sanitized,
      comingSoon: false,
      blocked: false,
      domain: url?.hostname ?? '',
    };
  }

  if (/testimonial page/i.test(platform)) {
    return {
      platform: 'Testimonial Page',
      category: 'review',
      marketingEligible: false,
      availability: 'supported',
      feedbackSupported: !!sanitized,
      comingSoon: false,
      blocked: false,
      domain: url?.hostname ?? '',
    };
  }

  if (/community thread/i.test(platform)) {
    return {
      platform: 'Community Thread',
      category: 'review',
      marketingEligible: false,
      availability: 'supported',
      feedbackSupported: !!sanitized,
      comingSoon: false,
      blocked: false,
      domain: url?.hostname ?? '',
    };
  }

  return {
    platform,
    category: 'web',
    marketingEligible: false,
    availability: 'supported',
    feedbackSupported: !!sanitized,
    comingSoon: false,
    blocked: false,
    domain: url?.hostname ?? '',
  };
}

export function normalizeSourceProfile(profile: Pick<SourceProfile, 'platform' | 'url'>): SourceProfile | null {
  const url = sanitizeUrl(profile.url);
  if (!url) return null;
  const platform = profile.platform?.trim() || inferPlatformFromUrl(url);
  return { platform, url };
}

export function dedupeSourceProfiles(profiles: Array<Pick<SourceProfile, 'platform' | 'url'>>): SourceProfile[] {
  const seen = new Set<string>();
  const result: SourceProfile[] = [];

  for (const profile of profiles) {
    const normalized = normalizeSourceProfile(profile);
    if (!normalized) continue;
    const key = normalized.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function isMarketingEligibleSource(profile: Pick<SourceProfile, 'platform' | 'url'>): boolean {
  return getSourceMeta(profile).marketingEligible;
}

export function isFeedbackSupportedSource(profile: Pick<SourceProfile, 'platform' | 'url'>): boolean {
  return getSourceMeta(profile).feedbackSupported;
}

export function isBlockedSource(profile: Pick<SourceProfile, 'platform' | 'url'>): boolean {
  return getSourceMeta(profile).blocked;
}

export function isComingSoonSource(profile: Pick<SourceProfile, 'platform' | 'url'>): boolean {
  return getSourceMeta(profile).comingSoon;
}

export function getFeedbackPlatformAvailability(platform: string): SourceMeta['availability'] {
  const descriptor = SOURCE_DESCRIPTORS.find((entry) => entry.label === platform);
  return descriptor?.availability ?? 'supported';
}

export function isSelectableFeedbackPlatform(platform: string): boolean {
  return getFeedbackPlatformAvailability(platform) === 'supported';
}

export function isLikelyFeedbackDiscoveryCandidate(urlStr: string): boolean {
  const sanitized = sanitizeUrl(urlStr);
  if (!sanitized) return false;

  const url = new URL(sanitized);
  const descriptor = findDescriptor(url);
  if (descriptor) return true;

  const full = `${url.hostname}${url.pathname}`.toLowerCase();
  if (REVIEW_PATH_RE.test(full) || COMMUNITY_PATH_RE.test(full)) return true;

  return false;
}

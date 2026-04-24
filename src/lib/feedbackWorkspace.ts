import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { scrapeWebsite } from './firecrawl';
import type { FeedbackResult } from './schemas';
import type { FeedbackAnalysis, Project } from './storage';
import {
  dedupeSourceProfiles,
  getSourceMeta,
  inferPlatformFromUrl,
  isLikelyFeedbackDiscoveryCandidate,
  normalizeSourceProfile,
  type SourceProfile,
} from './sourceProfiles';

export interface DiscoveredSource extends SourceProfile {
  origin: 'readme' | 'description' | 'analysis';
}

export interface SourceCollectionSummary {
  platform: string;
  url: string;
  status: 'collected' | 'empty' | 'failed' | 'blocked' | 'coming_soon';
  feedbackCount: number;
  message: string;
}

const README_FILENAMES = [
  'README.md',
  'README.mdx',
  'README.txt',
  'README',
];

const URL_RE = /https?:\/\/[^\s<>()"'`]+/g;
const IGNORE_DISCOVERY_HOSTS = ['github.com'];
const NOISE_RE = /(privacy|terms|cookies|sign in|log in|follow|share|menu|pricing|features|download|get started|contact us|skip to content|copyright|install app|join now|try for free|open app|subscribe)/i;
const FEEDBACK_SIGNAL_RE = /(love|like|enjoy|great|amazing|helpful|useful|intuitive|wish|please|need|want|can you|would be great|issue|bug|crash|broken|problem|slow|confusing|difficult|hate|frustrat|recommend|review|rating|stars?|improve|support)/i;
const PRODUCT_SIGNAL_RE = /\b(app|product|tool|site|platform|feature|support|team|onboarding|search|upload|login|export|dashboard|workflow|experience|ui|ux)\b/i;

async function readProjectReadme(projectPath?: string): Promise<string> {
  if (!projectPath) return '';

  for (const name of README_FILENAMES) {
    try {
      const content = await fs.readFile(path.join(projectPath, name), 'utf8');
      if (content.trim()) return content;
    } catch {
      // Ignore missing files.
    }
  }

  try {
    const files = await fs.readdir(projectPath);
    const readme = files.find((file) => /^readme(?:\.[a-z0-9]+)?$/i.test(file));
    if (!readme) return '';
    const content = await fs.readFile(path.join(projectPath, readme), 'utf8');
    return content.trim();
  } catch {
    return '';
  }
}

function extractUrlsFromText(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

function shouldKeepDiscoveredUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (IGNORE_DISCOVERY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      return false;
    }
  } catch {
    return false;
  }

  return isLikelyFeedbackDiscoveryCandidate(urlStr);
}

export async function discoverProjectSources(project: Project): Promise<DiscoveredSource[]> {
  const discovered: DiscoveredSource[] = [];
  const seen = new Set<string>();
  const readme = await readProjectReadme(project.path);

  const addCandidates = (urls: string[], origin: DiscoveredSource['origin']) => {
    for (const url of urls) {
      const normalized = normalizeSourceProfile({ platform: inferPlatformFromUrl(url), url });
      if (!normalized || !shouldKeepDiscoveredUrl(normalized.url)) continue;
      const key = normalized.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      discovered.push({ ...normalized, origin });
    }
  };

  addCandidates(extractUrlsFromText(readme), 'readme');
  addCandidates(extractUrlsFromText(project.description ?? ''), 'description');
  addCandidates(extractUrlsFromText(project.analysis?.description ?? ''), 'analysis');

  return discovered;
}

function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLongSegment(segment: string): string[] {
  if (segment.length <= 240) return [segment];
  return segment
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractSegments(markdown: string): string[] {
  return markdown
    .split(/\r?\n+/)
    .map(stripMarkdown)
    .filter(Boolean)
    .flatMap(splitLongSegment);
}

function scoreSegment(segment: string, source: SourceProfile): number {
  const { category } = getSourceMeta(source);
  const words = segment.split(/\s+/).length;

  if (segment.length < 18 || segment.length > 280 || words < 4) return -10;

  let score = 0;

  if (NOISE_RE.test(segment)) score -= 5;
  if (FEEDBACK_SIGNAL_RE.test(segment)) score += 3;
  if (PRODUCT_SIGNAL_RE.test(segment)) score += 2;
  if (/\b(i|we|my|our|me|us)\b/i.test(segment)) score += 2;
  if (/[.!?]/.test(segment)) score += 1;
  if (/\b(review|rating|stars?)\b/i.test(segment)) score += 2;
  if (category === 'review') score += 1;
  if (/^(home|pricing|features|docs|blog|contact)\b/i.test(segment)) score -= 4;

  return score;
}

export function normalizeFeedbackItem(item: string): string {
  return item
    .replace(/^[>\-*\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeFeedbackItems(items: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of items) {
    const normalized = normalizeFeedbackItem(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

export function canonicalizeFeedbackItems(items: string[]): string[] {
  return dedupeFeedbackItems(items)
    .map((item) => item.toLowerCase())
    .sort();
}

export function sameFeedbackSet(a: string[], b: string[]): boolean {
  const left = canonicalizeFeedbackItems(a);
  const right = canonicalizeFeedbackItems(b);

  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

export function extractFeedbackItemsFromMarkdown(markdown: string, source: SourceProfile): string[] {
  const segments = extractSegments(markdown);
  const scored = segments
    .map((segment) => ({ segment, score: scoreSegment(segment, source) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const primary = dedupeFeedbackItems(scored.filter((entry) => entry.score >= 3).map((entry) => entry.segment));
  if (primary.length > 0) return primary.slice(0, 18);

  const fallback = dedupeFeedbackItems(scored.map((entry) => entry.segment));
  return fallback.slice(0, 10);
}

export async function collectFeedbackFromSources(
  inputSources: Array<Pick<SourceProfile, 'platform' | 'url'>>,
): Promise<{ feedback: string[]; summaries: SourceCollectionSummary[]; warnings: string[] }> {
  const sources = dedupeSourceProfiles(inputSources);

  const results = await Promise.all(
    sources.map(async (source): Promise<{ summary: SourceCollectionSummary; items: string[] }> => {
      const meta = getSourceMeta(source);
      if (meta.comingSoon) {
        return {
          summary: {
            platform: meta.platform,
            url: source.url,
            status: 'coming_soon',
            feedbackCount: 0,
            message: `${meta.platform} feedback collection is coming soon.`,
          },
          items: [],
        };
      }

      if (meta.blocked) {
        return {
          summary: {
            platform: meta.platform,
            url: source.url,
            status: 'blocked',
            feedbackCount: 0,
            message: `${meta.platform} blocks automated collection.`,
          },
          items: [],
        };
      }

      const markdown = await scrapeWebsite(source.url);
      if (!markdown) {
        return {
          summary: {
            platform: meta.platform,
            url: source.url,
            status: 'failed',
            feedbackCount: 0,
            message: 'Could not access this source.',
          },
          items: [],
        };
      }

      const items = extractFeedbackItemsFromMarkdown(markdown, source);
      if (items.length === 0) {
        return {
          summary: {
            platform: meta.platform,
            url: source.url,
            status: 'empty',
            feedbackCount: 0,
            message: 'No feedback-like content was extracted from this source.',
          },
          items: [],
        };
      }

      return {
        summary: {
          platform: meta.platform,
          url: source.url,
          status: 'collected',
          feedbackCount: items.length,
          message: `Collected ${items.length} feedback item${items.length === 1 ? '' : 's'}.`,
        },
        items,
      };
    }),
  );

  const summaries = results.map((result) => result.summary);
  const feedback = dedupeFeedbackItems(results.flatMap((result) => result.items));
  const warnings = summaries
    .filter((summary) => summary.status !== 'collected')
    .map((summary) => `${summary.platform}: ${summary.message}`);

  return { feedback, summaries, warnings };
}

export function feedbackAnalysisToResult(analysis: FeedbackAnalysis): FeedbackResult {
  return {
    overallSentiment: analysis.sentiment as FeedbackResult['overallSentiment'],
    summary: analysis.summary ?? '',
    sentimentBreakdown: analysis.sentimentBreakdown,
    themes: analysis.themes,
    featureRequests: analysis.featureRequests,
    bugs: analysis.bugs,
    praises: analysis.praises,
    developerPrompts: analysis.developerPrompts,
  };
}

export function buildFeedbackAnalysisRecord(result: FeedbackResult, rawFeedback: string[]): FeedbackAnalysis {
  return {
    id: crypto.randomUUID(),
    rawFeedback: dedupeFeedbackItems(rawFeedback),
    sentiment: result.overallSentiment,
    summary: result.summary,
    sentimentBreakdown: result.sentimentBreakdown,
    themes: result.themes,
    featureRequests: result.featureRequests,
    bugs: result.bugs,
    praises: result.praises,
    developerPrompts: result.developerPrompts,
    analyzedAt: new Date().toISOString(),
  };
}

import fs from 'fs';
import path from 'path';
import { withFileLock } from './fileLock';

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  path: string;
  isGithub?: boolean;
  githubUrl?: string;
  lastAnalyzedCommitSha?: string;
  createdAt: string;
  analysis?: ProductAnalysis;
  marketingContent?: MarketingContent[];
  feedbackAnalyses?: FeedbackAnalysis[];
  campaigns?: Campaign[];
  socialProfiles?: { platform: string; url: string }[];
}

export interface ProductAnalysis {
  // Core identity
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];

  // Problem & market
  problemStatement: string;
  marketOpportunity: string;
  competitors: { name: string; url?: string; differentiator: string }[];
  competitorInsights?: import('./schemas').CompetitorInsight[];

  // Business model
  businessModel: string;
  revenueStreams: string[];
  pricingSuggestion: string;

  // Product maturity
  currentStage: 'idea' | 'mvp' | 'beta' | 'growth' | 'mature';

  // Strategic analysis
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  topRisks: string[];

  // Actionable guidance
  prioritizedNextSteps: string[];
  gtmStrategy: string;
  earlyAdopterChannels: string[];
  growthMetrics: string[];

  analyzedAt: string;
}

export interface MarketingContent {
  id: string;
  platform: string;
  content: Record<string, string>;
  generatedAt: string;
}

export interface Campaign {
  id: string;
  type: string;
  goal: string;
  duration: string;
  name: string;
  plan: Record<string, unknown>;
  createdAt: string;
}

export interface FeedbackAnalysis {
  id: string;
  rawFeedback: string[];
  sentiment: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
  analyzedAt: string;
}

export async function saveCampaignToProject(projectId: string, campaign: Campaign, userId?: string): Promise<boolean> {
  return withFileLock(getProjectsFile(), () => {
    const project = getProject(projectId, userId);
    if (!project) return false;
    if (!project.campaigns) project.campaigns = [];
    project.campaigns.unshift(campaign);
    saveProjectUnsafe(project);
    return true;
  });
}

export async function saveSocialProfilesToProject(projectId: string, profiles: { platform: string; url: string }[], userId?: string): Promise<boolean> {
  return withFileLock(getProjectsFile(), () => {
    const project = getProject(projectId, userId);
    if (!project) return false;
    project.socialProfiles = profiles;
    saveProjectUnsafe(project);
    return true;
  });
}

export async function saveFeedbackToProject(projectId: string, analysis: FeedbackAnalysis, userId?: string): Promise<boolean> {
  return withFileLock(getProjectsFile(), () => {
    const project = getProject(projectId, userId);
    if (!project) return false;
    if (!project.feedbackAnalyses) project.feedbackAnalyses = [];
    project.feedbackAnalyses.unshift(analysis);
    saveProjectUnsafe(project);
    return true;
  });
}

function getProjectsFile(): string {
  return path.join(DATA_DIR, 'projects.json');
}

export function getAllProjects(userId?: string): Project[] {
  ensureDataDir();
  const file = getProjectsFile();
  if (!fs.existsSync(file)) return [];
  const all: Project[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return userId ? all.filter((p) => p.userId === userId) : all;
}

export function getProject(id: string, userId?: string): Project | undefined {
  const project = getAllProjects().find((p) => p.id === id);
  if (!project) return undefined;
  if (userId && project.userId !== userId) return undefined;
  return project;
}

// Internal save without lock — used by functions that already hold the lock
function saveProjectUnsafe(project: Project): void {
  ensureDataDir();
  const projects = getAllProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.push(project);
  }
  fs.writeFileSync(getProjectsFile(), JSON.stringify(projects, null, 2));
}

export async function saveProject(project: Project): Promise<void> {
  return withFileLock(getProjectsFile(), () => {
    saveProjectUnsafe(project);
  });
}

export async function deleteProject(id: string): Promise<void> {
  return withFileLock(getProjectsFile(), () => {
    ensureDataDir();
    const projects = getAllProjects().filter((p) => p.id !== id);
    fs.writeFileSync(getProjectsFile(), JSON.stringify(projects, null, 2));
  });
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

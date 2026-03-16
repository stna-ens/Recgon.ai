import fs from 'fs';
import path from 'path';

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
  createdAt: string;
  analysis?: ProductAnalysis;
  marketingContent?: MarketingContent[];
  feedbackAnalyses?: FeedbackAnalysis[];
}

export interface ProductAnalysis {
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  analyzedAt: string;
}

export interface MarketingContent {
  id: string;
  platform: string;
  content: Record<string, string>;
  generatedAt: string;
}

export interface FeedbackAnalysis {
  id: string;
  rawFeedback: string[];
  sentiment: string;
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  developerPrompts: string[];
  analyzedAt: string;
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

export function saveProject(project: Project): void {
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

export function deleteProject(id: string): void {
  ensureDataDir();
  const projects = getAllProjects().filter((p) => p.id !== id);
  fs.writeFileSync(getProjectsFile(), JSON.stringify(projects, null, 2));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Project } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_FILE = path.resolve(__dirname, '..', '..', 'data', 'projects.json');

export function getAllProjects(): Project[] {
  if (!fs.existsSync(PROJECTS_FILE)) return [];
  const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8');
  return JSON.parse(raw) as Project[];
}

export function getProject(id: string): Project | undefined {
  return getAllProjects().find((p) => p.id === id);
}

export function saveProjects(projects: Project[]): void {
  const dir = path.dirname(PROJECTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

export function updateProject(updated: Project): void {
  const projects = getAllProjects();
  const idx = projects.findIndex((p) => p.id === updated.id);
  if (idx === -1) throw new Error(`Project ${updated.id} not found`);
  projects[idx] = updated;
  saveProjects(projects);
}

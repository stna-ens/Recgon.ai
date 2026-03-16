// Background video generation job tracker.
// Jobs are persisted to data/video-jobs.json so they survive server restarts.

import fs from 'fs';
import path from 'path';

export interface VideoJob {
  id: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  videoPath?: string;
  error?: string;
  startedAt: number;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'video-jobs.json');

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadJobs(): Map<string, VideoJob> {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const arr: VideoJob[] = JSON.parse(raw);
      return new Map(arr.map((j) => [j.id, j]));
    }
  } catch {
    // Corrupt file — start fresh
  }
  return new Map();
}

function saveJobs(jobs: Map<string, VideoJob>): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([...jobs.values()], null, 2));
  } catch (err) {
    console.error('[VideoJobs] Failed to persist jobs:', err);
  }
}

// ── Shared in-process store (survives hot-reloads; loaded from disk on boot) ──

const g = global as typeof globalThis & { _pmaiVideoJobs?: Map<string, VideoJob> };
if (!g._pmaiVideoJobs) g._pmaiVideoJobs = loadJobs();
const jobs = g._pmaiVideoJobs;

// ── Public API ────────────────────────────────────────────────────────────────

export function createJob(id: string): VideoJob {
  const job: VideoJob = { id, status: 'pending', startedAt: Date.now() };
  jobs.set(id, job);
  saveJobs(jobs);
  return job;
}

export function getJob(id: string): VideoJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, update: Partial<VideoJob>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, update);
    saveJobs(jobs);
  }
}

export function deleteJob(id: string): void {
  jobs.delete(id);
  saveJobs(jobs);
}

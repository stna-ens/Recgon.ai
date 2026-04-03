import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  url: string;
}

export async function getLatestCommit(githubUrl: string, token?: string): Promise<CommitInfo | null> {
  try {
    // Extract owner/repo from https://github.com/owner/repo or .../owner/repo.git
    const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) return null;
    const repo = match[1];

    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'PMAI-App' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/commits/HEAD`, {
      headers,
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    return {
      sha: data.sha,
      message: data.commit?.message?.split('\n')[0] ?? '',
      date: data.commit?.committer?.date ?? data.commit?.author?.date ?? '',
      url: data.html_url,
    };
  } catch {
    return null;
  }
}

export interface CommitDiff {
  files: Array<{ filename: string; status: string; patch?: string }>;
  commits: Array<{ message: string }>;
}

export async function getCommitDiff(
  githubUrl: string,
  baseSha: string,
  headSha: string,
  token?: string,
): Promise<CommitDiff | null> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) return null;
    const repo = match[1];

    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'PMAI-App' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/repos/${repo}/compare/${baseSha}...${headSha}`,
      {
        headers,
        next: { revalidate: 0 },
      },
    );
    if (!res.ok) return null;

    const data = await res.json();
    return {
      files: (data.files ?? []).map((f: { filename: string; status: string; patch?: string }) => ({
        filename: f.filename,
        status: f.status,
        patch: f.patch,
      })),
      commits: (data.commits ?? []).map((c: { commit: { message: string } }) => ({
        message: c.commit?.message?.split('\n')[0] ?? '',
      })),
    };
  } catch {
    return null;
  }
}

const execAsync = promisify(exec);

export async function cloneGitHubRepo(url: string, projectId: string, token?: string): Promise<string> {
  // Clean URL to prevent command injection
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith('https://github.com/')) {
    throw new Error('Invalid GitHub URL. Must start with https://github.com/');
  }

  // Create a unique temporary directory for this project
  const tmpDir = path.join(os.tmpdir(), `pmai-repos-${projectId}`);

  // Clean up if it somehow exists
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Embed token in URL for private repos (https://token@github.com/...)
  const cloneUrl = token
    ? cleanUrl.replace('https://', `https://${token}@`)
    : cleanUrl;

  // Clone with depth=1 to save time and bandwidth; 60s timeout to prevent hanging
  try {
    const command = `git clone --depth 1 ${cloneUrl} ${tmpDir}`;
    await execAsync(command, { timeout: 60_000 });
    
    // Remove the .git folder so we don't analyze git history/objects
    const gitFolder = path.join(tmpDir, '.git');
    if (fs.existsSync(gitFolder)) {
      fs.rmSync(gitFolder, { recursive: true, force: true });
    }
    
    return tmpDir;
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

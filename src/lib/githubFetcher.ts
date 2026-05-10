import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';

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

export interface RepoCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorAvatar: string | null;
  authorUrl: string | null;
  committedAt: string;
  url: string;
}

// Fetch the N most recent commits on default branch. Cached by Next.js for
// 5 minutes; never throws (returns [] on error so a single bad repo can't
// break the home cockpit).
export async function getRecentCommits(
  githubUrl: string,
  token?: string,
  perPage = 3,
): Promise<RepoCommit[]> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) return [];
    const repo = match[1];

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Recgon-App',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?per_page=${perPage}`,
      { headers, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];

    type Raw = {
      sha: string;
      html_url: string;
      commit: { message?: string; committer?: { date?: string }; author?: { date?: string } };
      author: { login?: string; avatar_url?: string; html_url?: string } | null;
    };
    const data = (await res.json()) as Raw[];
    return (data ?? []).map((c) => ({
      sha: c.sha,
      message: (c.commit?.message ?? '').split('\n')[0],
      authorName: c.author?.login ?? null,
      authorAvatar: c.author?.avatar_url ?? null,
      authorUrl: c.author?.html_url ?? null,
      committedAt: c.commit?.committer?.date ?? c.commit?.author?.date ?? '',
      url: c.html_url,
    }));
  } catch {
    return [];
  }
}

export interface CommitDetails {
  sha: string;
  message: string;
  authorName: string | null;
  committedAt: string;
  url: string;
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
  stats: { additions: number; deletions: number; total: number };
}

// Fetch a single commit's metadata + per-file patches. Used by the
// commit_summary worker to feed the LLM. Caps total patch size implicitly
// via GitHub's own response (large commits are paginated by GitHub).
export async function getCommitDetails(
  githubUrl: string,
  sha: string,
  token?: string,
): Promise<CommitDetails | null> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) return null;
    const repo = match[1];

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Recgon-App',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/${sha}`,
      { headers, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;

    type Raw = {
      sha: string;
      html_url: string;
      commit: { message?: string; committer?: { date?: string }; author?: { name?: string; date?: string } };
      author: { login?: string } | null;
      stats?: { additions?: number; deletions?: number; total?: number };
      files?: Array<{ filename: string; status: string; additions?: number; deletions?: number; patch?: string }>;
    };
    const data = (await res.json()) as Raw;
    return {
      sha: data.sha,
      message: (data.commit?.message ?? '').trim(),
      authorName: data.author?.login ?? data.commit?.author?.name ?? null,
      committedAt: data.commit?.committer?.date ?? data.commit?.author?.date ?? '',
      url: data.html_url,
      files: (data.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        patch: f.patch,
      })),
      stats: {
        additions: data.stats?.additions ?? 0,
        deletions: data.stats?.deletions ?? 0,
        total: data.stats?.total ?? 0,
      },
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

export async function cloneGitHubRepo(url: string, projectId: string, token?: string): Promise<string> {
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith('https://github.com/')) {
    throw new Error('Invalid GitHub URL. Must start with https://github.com/');
  }

  const match = cleanUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/)?$/);
  if (!match) throw new Error('Could not parse GitHub repository from URL');
  const repo = match[1];

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Recgon-App',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Download repo zip via GitHub API (no git binary needed)
  const res = await fetch(`https://api.github.com/repos/${repo}/zipball`, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(token
        ? 'Repository not found. Check the URL — and confirm your GitHub account has access if it is private.'
        : 'Repository not found. Check the URL, or connect GitHub in settings if the repo is private.');
    }
    if (res.status === 403) throw new Error('GitHub rate limit exceeded or access denied. Try again in a minute.');
    if (res.status === 401) throw new Error('Repository is private. Connect GitHub in settings to import private repos.');
    throw new Error(`Failed to download repository: ${res.status} ${res.statusText}`);
  }

  const zipBuffer = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBuffer);

  const tmpDir = path.join(os.tmpdir(), `pmai-repos-${projectId}`);
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  // GitHub zip has a single top-level folder (e.g. owner-repo-sha/); strip it.
  const writes: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    const parts = relativePath.split('/');
    const stripped = parts.slice(1).join('/');
    if (!stripped) return;

    const fullPath = path.join(tmpDir, stripped);
    // Guard against zip-slip path traversal
    if (!fullPath.startsWith(tmpDir + path.sep)) return;

    writes.push(
      file.async('nodebuffer').then((content) => {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
      }),
    );
  });

  await Promise.all(writes);
  return tmpDir;
}

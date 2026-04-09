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

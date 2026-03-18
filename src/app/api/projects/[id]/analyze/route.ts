import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/storage';
import { analyzeCodebase, analyzeCodebaseUpdate } from '@/lib/codeAnalyzer';
import { getLatestCommit, getCommitDiff } from '@/lib/githubFetcher';
import { validateEnv } from '@/lib/env';
import { isRateLimited, ANALYZE_LIMIT } from '@/lib/rateLimit';
import { auth } from '@/auth';

function formatDiff(diff: import('@/lib/githubFetcher').CommitDiff): string {
  const MAX_PATCH_CHARS = 1500;
  const MAX_FILES = 20;

  const lines: string[] = [
    `Changed files (${diff.files.length} total, showing up to ${MAX_FILES}):`,
    '',
  ];

  for (const file of diff.files.slice(0, MAX_FILES)) {
    lines.push(`--- ${file.filename} (${file.status}) ---`);
    if (file.patch) {
      lines.push(file.patch.substring(0, MAX_PATCH_CHARS));
      if (file.patch.length > MAX_PATCH_CHARS) lines.push('... (truncated)');
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (isRateLimited(`analyze:${ip}`, ANALYZE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    validateEnv();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const project = getProject(params.id, session.user.id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let analysis;

        const isGithubReanalysis =
          project.isGithub &&
          project.githubUrl &&
          project.lastAnalyzedCommitSha &&
          project.analysis;

        if (isGithubReanalysis) {
          send({ type: 'progress', message: 'Checking for new commits...' });
          const latestCommit = await getLatestCommit(project.githubUrl!);

          if (latestCommit && latestCommit.sha !== project.lastAnalyzedCommitSha) {
            send({ type: 'progress', message: 'Fetching diff since last analysis...' });
            const diff = await getCommitDiff(
              project.githubUrl!,
              project.lastAnalyzedCommitSha!,
              latestCommit.sha,
            );

            if (diff && diff.files.length > 0) {
              const diffStr = formatDiff(diff);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { analyzedAt: _, ...existingAnalysis } = project.analysis!;
              analysis = await analyzeCodebaseUpdate(existingAnalysis, diffStr, (message) => {
                send({ type: 'progress', message });
              });
              project.lastAnalyzedCommitSha = latestCommit.sha;
            } else {
              // Diff unavailable — fall back to full re-analysis
              analysis = await analyzeCodebase(project.path, (message) => {
                send({ type: 'progress', message });
              });
              project.lastAnalyzedCommitSha = latestCommit.sha;
            }
          } else {
            // No new commits — still do a full analysis (user explicitly requested it)
            analysis = await analyzeCodebase(project.path, (message) => {
              send({ type: 'progress', message });
            });
            if (latestCommit) project.lastAnalyzedCommitSha = latestCommit.sha;
          }
        } else {
          analysis = await analyzeCodebase(project.path, (message) => {
            send({ type: 'progress', message });
          });

          if (project.isGithub && project.githubUrl) {
            const commit = await getLatestCommit(project.githubUrl);
            if (commit) project.lastAnalyzedCommitSha = commit.sha;
          }
        }

        project.analysis = { ...analysis, analyzedAt: new Date().toISOString() };
        saveProject(project);
        send({ type: 'done', project });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Analysis failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

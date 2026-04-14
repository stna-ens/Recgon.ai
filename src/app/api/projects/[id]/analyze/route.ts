import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectTeamId, saveProject, type ProductAnalysis } from '@/lib/storage';
import { analyzeIdea } from '@/lib/ideaAnalyzer';
import { analyzeCodebase, analyzeCodebaseUpdate } from '@/lib/codeAnalyzer';
import { analyzeCompetitors } from '@/lib/competitorAnalyzer';
import { getLatestCommit, getCommitDiff, cloneGitHubRepo } from '@/lib/githubFetcher';
import { validateEnv } from '@/lib/env';
import { isRateLimited, ANALYZE_LIMIT } from '@/lib/rateLimit';
import { checkAnalysisQuota, recordAnalysis } from '@/lib/analysisQuota';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { getUserById } from '@/lib/userStorage';

function formatDiff(diff: import('@/lib/githubFetcher').CommitDiff): string {
  const MAX_PATCH_CHARS = 3000;
  const MAX_FILES = 25;

  const lines: string[] = [];

  if (diff.commits.length > 0) {
    lines.push('Commit messages:');
    diff.commits.forEach(c => lines.push(`  - ${c.message}`));
    lines.push('');
  }

  // Separate deleted files so they're always included and clearly labeled
  const deletedFiles = diff.files.filter(f => f.status === 'removed');
  const otherFiles = diff.files.filter(f => f.status !== 'removed');

  if (deletedFiles.length > 0) {
    lines.push(`DELETED FILES (${deletedFiles.length}) — remove any features/technologies that were only in these files:`);
    for (const f of deletedFiles) {
      lines.push(`--- ${f.filename} (removed) ---`);
      if (f.patch) {
        lines.push(f.patch.substring(0, MAX_PATCH_CHARS));
        if (f.patch.length > MAX_PATCH_CHARS) lines.push('... (truncated)');
      }
      lines.push('');
    }
  }

  lines.push(`Modified/added files (${otherFiles.length} total, showing up to ${MAX_FILES}):`);
  lines.push('');

  for (const file of otherFiles.slice(0, MAX_FILES)) {
    lines.push(`--- ${file.filename} (${file.status}) ---`);
    if (file.patch) {
      lines.push(file.patch.substring(0, MAX_PATCH_CHARS));
      if (file.patch.length > MAX_PATCH_CHARS) lines.push('... (truncated)');
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** For GitHub projects, ensure we have a fresh local clone to analyze. */
async function ensureFreshClone(
  projectId: string,
  githubUrl: string,
  send: (data: object) => void,
  token?: string,
): Promise<string> {
  send({ type: 'progress', message: 'Cloning repository...' });
  return cloneGitHubRepo(githubUrl, projectId, token);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (await isRateLimited(`analyze:${ip}`, ANALYZE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    validateEnv();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // Derive teamId from the project itself — never trust the client to tell us which
  // team a project belongs to.
  const teamId = await getProjectTeamId(id);
  if (!teamId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Enforce per-user analysis quota (3 total, 1 per 2 weeks)
  const quota = await checkAnalysisQuota(session.user.id, session.user.email ?? undefined);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quota.reason, quota },
      { status: 429 },
    );
  }

  const [project, user] = await Promise.all([
    getProject(id, teamId),
    getUserById(session.user.id),
  ]);
  const githubToken = user?.githubAccessToken;
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

        // Idea project branch
        if (project.sourceType === 'description') {
          if (!project.description) {
            send({ type: 'error', message: 'No description to analyze' });
            return;
          }
          analysis = await analyzeIdea(project.description, (msg) => send({ type: 'progress', message: msg }));
          project.analysis = { ...analysis, analyzedAt: new Date().toISOString() };
          await saveProject(project);
          await recordAnalysis(session.user.id, session.user.email ?? undefined);
          send({ type: 'done', project });
          return;
        }

        const isGithubReanalysis =
          project.isGithub &&
          project.githubUrl &&
          project.lastAnalyzedCommitSha &&
          project.analysis;

        if (isGithubReanalysis) {
          send({ type: 'progress', message: 'Checking for new commits...' });
          const latestCommit = await getLatestCommit(project.githubUrl!, githubToken);

          if (latestCommit && latestCommit.sha === project.lastAnalyzedCommitSha) {
            // No new commits since last analysis
            send({ type: 'done', project });
            return;
          }

          if (latestCommit && latestCommit.sha !== project.lastAnalyzedCommitSha) {
            send({ type: 'progress', message: 'Fetching diff since last analysis...' });
            const diff = await getCommitDiff(
              project.githubUrl!,
              project.lastAnalyzedCommitSha!,
              latestCommit.sha,
              githubToken,
            );

            if (diff && diff.files.length > 0) {
              const diffStr = formatDiff(diff);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { analyzedAt: _, improvements: _imp, nextStepsTaken: _nst, ...existingAnalysis } = project.analysis! as ProductAnalysis & { improvements?: unknown; nextStepsTaken?: unknown };
              analysis = await analyzeCodebaseUpdate(existingAnalysis, diffStr, (message) => {
                send({ type: 'progress', message });
              });
              project.lastAnalyzedCommitSha = latestCommit.sha;
            } else {
              // Diff unavailable — re-clone and do full re-analysis
              const clonePath = await ensureFreshClone(project.id, project.githubUrl!, send, githubToken);
              project.path = clonePath;
              analysis = await analyzeCodebase(clonePath, (message) => {
                send({ type: 'progress', message });
              });
              project.lastAnalyzedCommitSha = latestCommit.sha;
            }
          } else {
            // Can't reach GitHub API — re-clone and do full re-analysis
            const clonePath = await ensureFreshClone(project.id, project.githubUrl!, send, githubToken);
            project.path = clonePath;
            analysis = await analyzeCodebase(clonePath, (message) => {
              send({ type: 'progress', message });
            });
          }
        } else {
          // First analysis or local project
          let analyzePath: string = project.path ?? '';
          if (project.isGithub && project.githubUrl) {
            const clonePath = await ensureFreshClone(project.id, project.githubUrl, send, githubToken);
            project.path = clonePath;
            analyzePath = clonePath;
          }
          if (!analyzePath) {
            send({ type: 'error', message: 'No path to analyze' });
            return;
          }
          analysis = await analyzeCodebase(analyzePath, (message) => {
            send({ type: 'progress', message });
          });

          if (project.isGithub && project.githubUrl) {
            // Retry up to 2 times to ensure SHA is always saved after first analysis
            let commit = await getLatestCommit(project.githubUrl, githubToken);
            if (!commit) commit = await getLatestCommit(project.githubUrl, githubToken);
            if (commit) project.lastAnalyzedCommitSha = commit.sha;
          }
        }

        project.analysis = { ...analysis, analyzedAt: new Date().toISOString() };
        await saveProject(project);

        // Record quota usage after successful save
        await recordAnalysis(session.user.id, session.user.email ?? undefined);

        // Competitor deep analysis — runs after main save, failure is non-fatal
        if (analysis.competitors?.some((c) => c.url)) {
          send({ type: 'progress', message: 'Analyzing competitor websites...' });
          try {
            const competitorInsights = await analyzeCompetitors(analysis.competitors, project.analysis);
            project.analysis = { ...project.analysis, competitorInsights };
            await saveProject(project);
          } catch {
            // competitor analysis is best-effort
          }
        }

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

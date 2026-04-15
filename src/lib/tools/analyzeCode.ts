import { z } from 'zod';
import { getProject, saveProject } from '../storage';
import { analyzeCodebase, analyzeCodebaseUpdate } from '../codeAnalyzer';
import { analyzeIdea } from '../ideaAnalyzer';
import { getLatestCommit, getCommitDiff, cloneGitHubRepo } from '../githubFetcher';
import { checkAnalysisQuota, recordAnalysis } from '../analysisQuota';
import { getUserById } from '../userStorage';
import { resolveProject } from './resolveProject';
import type { ToolDefinition } from './types';

const parameters = z.object({
  project: z.string().describe('Project name (or UUID). Partial names work.'),
});

type Input = z.infer<typeof parameters>;

interface AnalyzeOutput {
  projectId: string;
  projectName: string;
  summary: string;
  stage?: string;
  topNextSteps?: string[];
}

export const analyzeCodeTool: ToolDefinition<Input, AnalyzeOutput> = {
  name: 'analyze_code',
  description:
    'Run a full product + strategy analysis on a project (codebase, GitHub repo, or idea description). Enforces the per-user quota. Call this when the user says "analyze", "re-analyze", "run analysis", or asks for an up-to-date product brief.',
  parameters,
  summarize: (_input, output) => `${output.projectName}: ${output.summary}`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId);

    const quota = await checkAnalysisQuota(ctx.userId);
    if (!quota.allowed) {
      throw new Error(quota.reason ?? 'Analysis quota exceeded');
    }

    const user = await getUserById(ctx.userId);
    const githubToken = user?.githubAccessToken;

    let analysis;

    if (project.sourceType === 'description') {
      if (!project.description) throw new Error('No description to analyze');
      analysis = await analyzeIdea(project.description);
    } else if (project.isGithub && project.githubUrl) {
      const latestCommit = await getLatestCommit(project.githubUrl, githubToken);

      if (
        latestCommit &&
        latestCommit.sha !== project.lastAnalyzedCommitSha &&
        project.analysis &&
        project.lastAnalyzedCommitSha
      ) {
        // Diff-based update
        const diff = await getCommitDiff(
          project.githubUrl,
          project.lastAnalyzedCommitSha,
          latestCommit.sha,
          githubToken,
        );
        if (diff && diff.files.length > 0) {
          const diffLines: string[] = [];
          if (diff.commits.length > 0) {
            diffLines.push('Commit messages:');
            diff.commits.forEach((c) => diffLines.push(`  - ${c.message}`));
          }
          diff.files.slice(0, 25).forEach((f) => {
            diffLines.push(`--- ${f.filename} (${f.status}) ---`);
            if (f.patch) diffLines.push(f.patch.substring(0, 3000));
          });
          const { analyzedAt: _, improvements: _i, nextStepsTaken: _n, ...existing } =
            project.analysis as typeof project.analysis & { improvements?: unknown; nextStepsTaken?: unknown };
          analysis = await analyzeCodebaseUpdate(existing, diffLines.join('\n'));
          project.lastAnalyzedCommitSha = latestCommit.sha;
        }
      }

      if (!analysis) {
        const clonePath = await cloneGitHubRepo(project.githubUrl, project.id, githubToken);
        project.path = clonePath;
        analysis = await analyzeCodebase(clonePath);
        if (latestCommit) project.lastAnalyzedCommitSha = latestCommit.sha;
      }
    } else {
      if (!project.path) throw new Error('No path to analyze');
      analysis = await analyzeCodebase(project.path);
    }

    project.analysis = { ...analysis, analyzedAt: new Date().toISOString() };
    await saveProject(project);
    await recordAnalysis(ctx.userId);

    const refetched = await getProject(project.id, ctx.teamId);
    return {
      projectId: project.id,
      projectName: project.name,
      summary: analysis.description ?? 'Analysis complete',
      stage: analysis.currentStage,
      topNextSteps: analysis.prioritizedNextSteps?.slice(0, 3),
      analysis: refetched?.analysis,
    } as AnalyzeOutput;
  },
};

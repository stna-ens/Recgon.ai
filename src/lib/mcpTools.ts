import * as z from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAllProjects, getProjectForTeams, saveProject } from './storage';
import type { ProductAnalysis, FeedbackAnalysis } from './storage';

export function registerTools(server: McpServer, teamIds: string[], userId?: string): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List Recgon Projects',
      description:
        'List all projects analyzed by Recgon. Returns project id, name, stage, whether analysis exists, feedback count, and campaign count.',
      inputSchema: z.object({}),
    },
    async () => {
      const allProjects = await Promise.all(teamIds.map((tid) => getAllProjects(tid, userId)));
      const projects = allProjects.flat();
      const summary = projects.map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        githubUrl: p.githubUrl ?? null,
        currentStage: p.analysis?.currentStage ?? null,
        hasAnalysis: !!p.analysis,
        analyzedAt: p.analysis?.analyzedAt ?? null,
        feedbackCount: p.feedbackAnalyses?.length ?? 0,
        campaignCount: p.campaigns?.length ?? 0,
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_project_analysis',
    {
      title: 'Get Project Analysis',
      description:
        'Get the full Recgon analysis for a project including SWOT, tech stack, next steps with completion status, risks, feedback summaries, and developer prompts.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID from list_projects'),
      }),
    },
    async ({ projectId }) => {
      const project = await getProjectForTeams(projectId, teamIds, userId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found or access denied.` }], isError: true };
      }
      if (!project.analysis) {
        return {
          content: [{ type: 'text' as const, text: `Project "${project.name}" has no analysis yet. Run an analysis in the Recgon dashboard first.` }],
          isError: true,
        };
      }

      const nextSteps = buildNextSteps(project.analysis);
      const devPrompts = buildDeveloperPrompts(project.feedbackAnalyses ?? []);

      const result = {
        project: { id: project.id, name: project.name, githubUrl: project.githubUrl ?? null },
        analysis: project.analysis,
        nextSteps,
        developerPrompts: devPrompts,
        feedbackSummaries: (project.feedbackAnalyses ?? []).map((fa) => ({
          id: fa.id,
          sentiment: fa.sentiment,
          themes: fa.themes,
          featureRequests: fa.featureRequests,
          bugs: fa.bugs,
          developerPromptCount: fa.developerPrompts.length,
          analyzedAt: fa.analyzedAt,
        })),
        campaignCount: project.campaigns?.length ?? 0,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_actionable_items',
    {
      title: 'Get Actionable Items',
      description:
        'Get a combined, prioritized list of incomplete next steps and pending developer prompts for a project. This is the "what should I work on?" entry point.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID from list_projects'),
      }),
    },
    async ({ projectId }) => {
      const project = await getProjectForTeams(projectId, teamIds, userId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found or access denied.` }], isError: true };
      }
      if (!project.analysis) {
        return { content: [{ type: 'text' as const, text: `Project "${project.name}" has no analysis yet.` }], isError: true };
      }

      const nextSteps = buildNextSteps(project.analysis).filter((s) => !s.taken);
      const devPrompts = buildDeveloperPrompts(project.feedbackAnalyses ?? []).filter((p) => !p.completed);

      const result = {
        project: { id: project.id, name: project.name, techStack: project.analysis.techStack },
        incompleteNextSteps: nextSteps,
        pendingDeveloperPrompts: devPrompts,
        totalActionable: nextSteps.length + devPrompts.length,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'mark_item_complete',
    {
      title: 'Mark Item Complete',
      description:
        'Mark a next step or developer prompt as completed after implementing it. This closes the feedback loop between Recgon analysis and Claude Code implementation.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID'),
        itemType: z.enum(['next-step', 'developer-prompt']).describe('Type of item to mark complete'),
        index: z.number().describe('The index of the item (from get_actionable_items)'),
        feedbackId: z.string().optional().describe('Required when itemType is "developer-prompt" — the feedback analysis ID'),
        evidence: z.string().describe('Brief description of what was done to complete this item'),
      }),
    },
    async ({ projectId, itemType, index, feedbackId, evidence }) => {
      const project = await getProjectForTeams(projectId, teamIds, userId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found or access denied.` }], isError: true };
      }
      if (!project.analysis) {
        return { content: [{ type: 'text' as const, text: `Project has no analysis.` }], isError: true };
      }

      if (itemType === 'next-step') {
        const analysis = project.analysis;
        if (index < 0 || index >= analysis.prioritizedNextSteps.length) {
          return {
            content: [{ type: 'text' as const, text: `Invalid step index ${index}. Valid range: 0-${analysis.prioritizedNextSteps.length - 1}` }],
            isError: true,
          };
        }
        if (!analysis.nextStepsTaken) {
          analysis.nextStepsTaken = analysis.prioritizedNextSteps.map((step) => ({ step, taken: false, evidence: '' }));
        }
        analysis.nextStepsTaken[index] = { step: analysis.prioritizedNextSteps[index], taken: true, evidence };
        await saveProject(project);
        return {
          content: [{ type: 'text' as const, text: `Marked next step ${index} as complete: "${analysis.prioritizedNextSteps[index]}"\nEvidence: ${evidence}` }],
        };
      } else {
        if (!feedbackId) {
          return { content: [{ type: 'text' as const, text: 'feedbackId is required when marking a developer-prompt complete.' }], isError: true };
        }
        const fa = project.feedbackAnalyses?.find((f) => f.id === feedbackId);
        if (!fa) {
          return { content: [{ type: 'text' as const, text: `Feedback analysis "${feedbackId}" not found.` }], isError: true };
        }
        if (index < 0 || index >= fa.developerPrompts.length) {
          return {
            content: [{ type: 'text' as const, text: `Invalid prompt index ${index}. Valid range: 0-${fa.developerPrompts.length - 1}` }],
            isError: true,
          };
        }
        if (!fa.completedPrompts) fa.completedPrompts = [];
        if (fa.completedPrompts.some((cp) => cp.promptIndex === index)) {
          return { content: [{ type: 'text' as const, text: `Developer prompt ${index} is already marked as complete.` }] };
        }
        fa.completedPrompts.push({ promptIndex: index, completedAt: new Date().toISOString(), completedBy: 'claude-code' });
        await saveProject(project);
        return {
          content: [{ type: 'text' as const, text: `Marked developer prompt ${index} as complete: "${fa.developerPrompts[index]}"\nEvidence: ${evidence}` }],
        };
      }
    },
  );
}

// --- Helpers ---

function buildNextSteps(analysis: ProductAnalysis) {
  return analysis.prioritizedNextSteps.map((step, i) => {
    const taken = analysis.nextStepsTaken?.find((nst) => nst.step === step);
    return { index: i, step, taken: taken?.taken ?? false, evidence: taken?.evidence ?? null };
  });
}

function buildDeveloperPrompts(feedbackAnalyses: FeedbackAnalysis[]) {
  const items: { feedbackId: string; promptIndex: number; text: string; completed: boolean; completedAt: string | null }[] = [];
  for (const fa of feedbackAnalyses) {
    for (let i = 0; i < fa.developerPrompts.length; i++) {
      const completed = fa.completedPrompts?.find((cp) => cp.promptIndex === i);
      items.push({ feedbackId: fa.id, promptIndex: i, text: fa.developerPrompts[i], completed: !!completed, completedAt: completed?.completedAt ?? null });
    }
  }
  return items;
}

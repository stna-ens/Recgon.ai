import * as z from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAllProjects, getProjectForTeams, saveProject } from './storage';
import type { ProductAnalysis } from './storage';

export function registerTools(server: McpServer, teamIds: string[], userId?: string): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List Recgon Projects',
      description:
        'List all projects analyzed by Recgon. Returns project id, name, stage, whether analysis exists, and campaign count.',
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
        'Get the full Recgon analysis for a project including SWOT, tech stack, next steps with completion status, and risks.',
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

      const result = {
        project: { id: project.id, name: project.name, githubUrl: project.githubUrl ?? null },
        analysis: project.analysis,
        nextSteps,
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
        'Get a prioritized list of incomplete next steps for a project. This is the "what should I work on?" entry point.',
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

      const result = {
        project: { id: project.id, name: project.name, techStack: project.analysis.techStack },
        incompleteNextSteps: nextSteps,
        totalActionable: nextSteps.length,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'mark_item_complete',
    {
      title: 'Mark Item Complete',
      description:
        'Mark a next step as completed after implementing it. This closes the loop between Recgon analysis and Claude Code implementation.',
      inputSchema: z.object({
        projectId: z.string().describe('The project ID'),
        index: z.number().describe('The index of the next step (from get_actionable_items)'),
        evidence: z.string().describe('Brief description of what was done to complete this item'),
      }),
    },
    async ({ projectId, index, evidence }) => {
      const project = await getProjectForTeams(projectId, teamIds, userId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project not found or access denied.` }], isError: true };
      }
      if (!project.analysis) {
        return { content: [{ type: 'text' as const, text: `Project has no analysis.` }], isError: true };
      }

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

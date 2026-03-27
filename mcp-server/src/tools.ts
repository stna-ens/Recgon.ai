import * as z from 'zod/v4';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateAuth } from './auth.js';
import { getAllProjects, getProject, updateProject } from './data.js';
import type { FeedbackAnalysis, Project } from './types.js';

export function registerTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List Recgon Projects',
      description:
        'List all projects analyzed by Recgon. Returns project id, name, stage, whether analysis exists, feedback count, and campaign count.',
      inputSchema: z.object({}),
    },
    async () => {
      validateAuth();
      const projects = getAllProjects();
      const summary = projects.map((p) => ({
        id: p.id,
        name: p.name,
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
      validateAuth();
      const project = getProject(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectId}" not found.` }], isError: true };
      }
      if (!project.analysis) {
        return {
          content: [{ type: 'text' as const, text: `Project "${project.name}" has no analysis yet. Run an analysis in the Recgon dashboard first.` }],
          isError: true,
        };
      }

      const nextSteps = buildNextSteps(project);
      const devPrompts = buildDeveloperPrompts(project);

      const result = {
        project: {
          id: project.id,
          name: project.name,
          githubUrl: project.githubUrl ?? null,
        },
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

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
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
      validateAuth();
      const project = getProject(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectId}" not found.` }], isError: true };
      }
      if (!project.analysis) {
        return {
          content: [{ type: 'text' as const, text: `Project "${project.name}" has no analysis yet.` }],
          isError: true,
        };
      }

      const nextSteps = buildNextSteps(project).filter((s) => !s.taken);
      const devPrompts = buildDeveloperPrompts(project).filter((p) => !p.completed);

      const result = {
        project: { id: project.id, name: project.name, techStack: project.analysis.techStack },
        incompleteNextSteps: nextSteps,
        pendingDeveloperPrompts: devPrompts,
        totalActionable: nextSteps.length + devPrompts.length,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
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
      validateAuth();
      const project = getProject(projectId);
      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectId}" not found.` }], isError: true };
      }
      if (!project.analysis) {
        return { content: [{ type: 'text' as const, text: `Project has no analysis.` }], isError: true };
      }

      if (itemType === 'next-step') {
        return markNextStepComplete(project, index, evidence);
      } else {
        if (!feedbackId) {
          return {
            content: [{ type: 'text' as const, text: 'feedbackId is required when marking a developer-prompt complete.' }],
            isError: true,
          };
        }
        return markDeveloperPromptComplete(project, feedbackId, index, evidence);
      }
    },
  );
}

// --- Helpers ---

interface NextStepItem {
  index: number;
  step: string;
  taken: boolean;
  evidence: string | null;
}

function buildNextSteps(project: Project): NextStepItem[] {
  const analysis = project.analysis;
  if (!analysis) return [];

  return analysis.prioritizedNextSteps.map((step, i) => {
    const taken = analysis.nextStepsTaken?.find((nst) => nst.step === step);
    return {
      index: i,
      step,
      taken: taken?.taken ?? false,
      evidence: taken?.evidence ?? null,
    };
  });
}

interface DeveloperPromptItem {
  feedbackId: string;
  promptIndex: number;
  text: string;
  completed: boolean;
  completedAt: string | null;
}

function buildDeveloperPrompts(project: Project): DeveloperPromptItem[] {
  const items: DeveloperPromptItem[] = [];
  for (const fa of project.feedbackAnalyses ?? []) {
    for (let i = 0; i < fa.developerPrompts.length; i++) {
      const completed = fa.completedPrompts?.find((cp) => cp.promptIndex === i);
      items.push({
        feedbackId: fa.id,
        promptIndex: i,
        text: fa.developerPrompts[i],
        completed: !!completed,
        completedAt: completed?.completedAt ?? null,
      });
    }
  }
  return items;
}

function markNextStepComplete(project: Project, index: number, evidence: string) {
  const analysis = project.analysis!;
  if (index < 0 || index >= analysis.prioritizedNextSteps.length) {
    return {
      content: [{ type: 'text' as const, text: `Invalid step index ${index}. Valid range: 0-${analysis.prioritizedNextSteps.length - 1}` }],
      isError: true,
    };
  }

  // Bootstrap nextStepsTaken if it doesn't exist
  if (!analysis.nextStepsTaken) {
    analysis.nextStepsTaken = analysis.prioritizedNextSteps.map((step) => ({
      step,
      taken: false,
      evidence: '',
    }));
  }

  analysis.nextStepsTaken[index] = {
    step: analysis.prioritizedNextSteps[index],
    taken: true,
    evidence,
  };

  updateProject(project);

  return {
    content: [
      {
        type: 'text' as const,
        text: `Marked next step ${index} as complete: "${analysis.prioritizedNextSteps[index]}"\nEvidence: ${evidence}`,
      },
    ],
  };
}

function markDeveloperPromptComplete(project: Project, feedbackId: string, promptIndex: number, evidence: string) {
  const fa = project.feedbackAnalyses?.find((f) => f.id === feedbackId) as FeedbackAnalysis | undefined;
  if (!fa) {
    return {
      content: [{ type: 'text' as const, text: `Feedback analysis "${feedbackId}" not found.` }],
      isError: true,
    };
  }
  if (promptIndex < 0 || promptIndex >= fa.developerPrompts.length) {
    return {
      content: [{ type: 'text' as const, text: `Invalid prompt index ${promptIndex}. Valid range: 0-${fa.developerPrompts.length - 1}` }],
      isError: true,
    };
  }

  if (!fa.completedPrompts) {
    fa.completedPrompts = [];
  }

  // Don't double-complete
  if (fa.completedPrompts.some((cp) => cp.promptIndex === promptIndex)) {
    return {
      content: [{ type: 'text' as const, text: `Developer prompt ${promptIndex} is already marked as complete.` }],
    };
  }

  fa.completedPrompts.push({
    promptIndex,
    completedAt: new Date().toISOString(),
    completedBy: 'claude-code',
  });

  updateProject(project);

  return {
    content: [
      {
        type: 'text' as const,
        text: `Marked developer prompt ${promptIndex} as complete: "${fa.developerPrompts[promptIndex]}"\nEvidence: ${evidence}`,
      },
    ],
  };
}

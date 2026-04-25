import { z } from 'zod';
import { generateCampaignPlan, type CampaignType } from '../contentGenerator';
import { saveCampaignToProject, generateId } from '../storage';
import { buildProjectAppContext } from '../appContext';
import { resolveProject } from './resolveProject';
import type { ToolDefinition } from './types';

const campaignTypes = [
  'product-launch',
  'brand-awareness',
  'lead-generation',
  'community-growth',
  're-engagement',
  'content-marketing',
] as const;

const parameters = z.object({
  project: z.string().describe('Project name or UUID to generate a campaign plan for.'),
  campaignType: z.enum(campaignTypes).describe('Type of campaign to plan.'),
  goal: z.string().min(1).describe('Specific campaign goal, e.g. "get 100 waitlist signups".'),
  duration: z.string().default('1 month').describe('Campaign duration, e.g. "2 weeks", "1 month", or "3 months".'),
  websiteUrl: z.string().url().optional().describe('Optional live website URL to inspect for messaging context.'),
});

type Input = z.infer<typeof parameters>;

interface CampaignOutput {
  projectName: string;
  campaignId: string;
  campaignName: string;
  summary: string;
  channels: string[];
  quickWins: string[];
}

export const generateCampaignTool: ToolDefinition<Input, CampaignOutput> = {
  name: 'generate_campaign',
  description:
    'Generate and save a full marketing campaign plan for a project. Saves the campaign so it appears on the Marketing page. Call this when the user asks for a campaign, launch plan, content calendar, or marketing plan.',
  parameters,
  summarize: (_input, output) => `${output.projectName}: campaign "${output.campaignName}" generated`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    if (!project.analysis) {
      throw new Error(`${project.name} has not been analyzed yet. Run analyze_code first.`);
    }

    const plan = await generateCampaignPlan(
      project.analysis,
      input.campaignType as CampaignType,
      input.goal,
      input.duration,
      input.websiteUrl,
      buildProjectAppContext(project),
    );

    const campaign = {
      id: generateId(),
      type: input.campaignType,
      goal: input.goal,
      duration: input.duration,
      name: plan.campaignName,
      plan: plan as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };

    const saved = await saveCampaignToProject(project.id, campaign, ctx.teamId);
    if (!saved) throw new Error('Failed to save campaign to project.');

    return {
      projectName: project.name,
      campaignId: campaign.id,
      campaignName: plan.campaignName,
      summary: plan.summary,
      channels: plan.channels.map((channel) => channel.platform).slice(0, 6),
      quickWins: plan.quickWins.slice(0, 5),
    };
  },
};

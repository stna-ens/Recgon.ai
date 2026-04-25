import { z } from 'zod';
import { generateMarketingContent, type Platform } from '../contentGenerator';
import { saveProject, generateId } from '../storage';
import { buildProjectAppContext } from '../appContext';
import { resolveProject } from './resolveProject';
import type { ToolDefinition } from './types';

const PLATFORMS = ['instagram', 'tiktok', 'google-ads'] as const;

const parameters = z.object({
  project: z.string().describe('Project name or UUID to generate content for.'),
  platform: z
    .enum(PLATFORMS)
    .describe('Platform to generate content for: instagram, tiktok, or google-ads.'),
  customPrompt: z
    .string()
    .optional()
    .describe(
      'Optional extra instruction for the AI — e.g. "focus on the free tier", "target developers", "use a casual tone".',
    ),
});

type Input = z.infer<typeof parameters>;

interface ContentOutput {
  projectName: string;
  platform: Platform;
  content: Record<string, string>;
}

export const generateContentTool: ToolDefinition<Input, ContentOutput> = {
  name: 'generate_content',
  description:
    'Generate marketing content for a project on a specific platform (instagram, tiktok, google-ads). Requires the project to have been analyzed first. Call this when the user asks to write, draft, or generate a post, ad, or marketing copy.',
  parameters,
  summarize: (input, output) => `${output.projectName} — ${input.platform} content generated`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);

    if (!project.analysis) {
      throw new Error(
        `${project.name} hasn't been analyzed yet. Run \`analyze_code\` first so I have product context to write from.`,
      );
    }

    const generated = await generateMarketingContent(
      project.analysis,
      input.platform as Platform,
      input.customPrompt,
      undefined,
      buildProjectAppContext(project),
    );

    // Persist to project
    const newEntry = {
      id: generateId(),
      platform: generated.platform,
      content: generated.content,
      generatedAt: new Date().toISOString(),
    };
    project.marketingContent = [newEntry, ...(project.marketingContent ?? [])];
    await saveProject(project);

    return {
      projectName: project.name,
      platform: generated.platform,
      content: generated.content,
    };
  },
};

import { ANALYZE_IDEA_SYSTEM, analyzeIdeaUserPrompt } from './prompts';
import { AnalysisResultSchema } from './schemas';
import { generateStructuredOutput } from './llm/quality';
import type { AnalysisResult } from './schemas';

export async function analyzeIdea(
  description: string,
  onProgress?: (message: string) => void,
  appContext?: string,
): Promise<AnalysisResult> {
  onProgress?.('Analyzing your idea...');
  const analysis = await generateStructuredOutput({
    taskKind: 'idea_analysis',
    schema: AnalysisResultSchema,
    systemPrompt: ANALYZE_IDEA_SYSTEM,
    userPrompt: analyzeIdeaUserPrompt(description, appContext),
    options: { temperature: 0.4, maxTokens: 16384 },
    qualityProfile: 'analysis',
  });
  onProgress?.('Parsing and validating analysis...');
  return analysis;
}

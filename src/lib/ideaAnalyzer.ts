import { chat } from './gemini';
import { ANALYZE_IDEA_SYSTEM, analyzeIdeaUserPrompt } from './prompts';
import { AnalysisResultSchema, parseAIResponse } from './schemas';
import type { AnalysisResult } from './schemas';

export async function analyzeIdea(
  description: string,
  onProgress?: (message: string) => void,
): Promise<AnalysisResult> {
  onProgress?.('Analyzing your idea...');
  const response = await chat(
    ANALYZE_IDEA_SYSTEM,
    analyzeIdeaUserPrompt(description),
    { temperature: 0.4, maxTokens: 16384 },
  );
  onProgress?.('Parsing and validating analysis...');
  return parseAIResponse(response, AnalysisResultSchema);
}

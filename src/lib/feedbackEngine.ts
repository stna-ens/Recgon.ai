import { FEEDBACK_SYSTEM, feedbackUserPrompt } from './prompts';
import { FeedbackResultSchema } from './schemas';
import { generateStructuredOutput } from './llm/quality';

export type { FeedbackResult } from './schemas';

export async function analyzeFeedback(
  feedbackItems: string[],
  appContext?: string,
): Promise<import('./schemas').FeedbackResult> {
  const feedbackStr = feedbackItems
    .map((item, i) => `[Feedback ${i + 1}]: ${item}`)
    .join('\n\n');

  return generateStructuredOutput({
    taskKind: 'feedback_analysis',
    schema: FeedbackResultSchema,
    systemPrompt: FEEDBACK_SYSTEM,
    userPrompt: feedbackUserPrompt(feedbackStr, appContext),
    options: { temperature: 0.5, maxTokens: 8192 },
    qualityProfile: 'feedback',
  });
}

import { chat } from './gemini';
import { FEEDBACK_SYSTEM, feedbackUserPrompt } from './prompts';
import { FeedbackResultSchema, parseAIResponse } from './schemas';

export type { FeedbackResult } from './schemas';

export async function analyzeFeedback(feedbackItems: string[]): Promise<import('./schemas').FeedbackResult> {
  const feedbackStr = feedbackItems
    .map((item, i) => `[Feedback ${i + 1}]: ${item}`)
    .join('\n\n');

  const response = await chat(FEEDBACK_SYSTEM, feedbackUserPrompt(feedbackStr), { temperature: 0.5, maxTokens: 8192 });
  return parseAIResponse(response, FeedbackResultSchema);
}

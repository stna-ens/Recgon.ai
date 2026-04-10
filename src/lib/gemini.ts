import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { logger } from './logger';

function isOverloaded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('503') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('high demand');
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.toLowerCase().includes('too many requests') || msg.toLowerCase().includes('quota');
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const overloaded = isOverloaded(err);
      const rateLimited = isRateLimited(err);
      if ((overloaded || rateLimited) && attempt < retries) {
        const delay = rateLimited ? 5000 * (attempt + 1) : 1000 * 2 ** attempt; // rate limit: 5s, 10s, 15s; overload: 1s, 2s, 4s
        logger.warn(`Gemini ${rateLimited ? 'rate limited' : 'overloaded'}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

// `thinkingConfig` is a Gemini 2.5 setting not yet typed in @google/generative-ai.
type GenerationConfigWithThinking = GenerationConfig & {
  thinkingConfig?: { thinkingBudget: number };
};

let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export async function chat(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  const content = await withRetry(() => model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: userPrompt }] }
    ],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 8192,
      responseMimeType: 'application/json',
      // Disable thinking for structured JSON tasks — thinking tokens eat into
      // the output budget and can truncate the response before it closes.
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfigWithThinking,
  }));

  const response = await content.response;
  const text = response.text();
  logger.debug('gemini response received', { length: text.length });
  return text;
}

import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { logger } from './logger';

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
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const content = await model.generateContent({
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
  });

  const response = await content.response;
  const text = response.text();
  logger.debug('gemini response received', { length: text.length });
  return text;
}

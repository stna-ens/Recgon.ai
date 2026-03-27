import { GoogleGenerativeAI } from '@google/generative-ai';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  const response = await content.response;
  const text = response.text();
  console.log('[Gemini Raw Response]:', text.substring(0, 500));
  return text;
}

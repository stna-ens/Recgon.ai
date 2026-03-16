import { GoogleGenAI } from '@google/genai';
import { imageGenerationPrompt } from './prompts';

let genAI: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }
  return genAI;
}

export async function generateMarketingImage(
  productName: string,
  productDescription: string,
  platform: 'instagram' | 'tiktok' | 'google-ads',
  customPrompt?: string
): Promise<string | null> {
  try {
    const ai = getClient();

    const format = platform === 'tiktok' ? 'vertical 9:16 format' : 'square 1:1 format';
    const prompt = imageGenerationPrompt(productName, productDescription, format, customPrompt);

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-fast-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const imageBytes = response.generatedImages[0].image?.imageBytes;
      if (imageBytes) {
        return `data:image/png;base64,${imageBytes}`;
      }
    }

    return null;
  } catch (error) {
    console.error('[ImageGenerator] Failed to generate image:', error);
    return null;
  }
}

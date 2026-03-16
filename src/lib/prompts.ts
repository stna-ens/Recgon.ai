// ─────────────────────────────────────────────────────────────────────────────
// Centralised prompt registry.
// Every Gemini prompt lives here so they can be found, reviewed, and iterated
// in one place rather than being scattered across lib files.
// ─────────────────────────────────────────────────────────────────────────────

// ── Codebase analysis ────────────────────────────────────────────────────────

export const ANALYZE_SYSTEM = `You are a world-class product analyst and marketer. You analyze codebases to understand what a product does, who it's for, and how to market it.

Respond with valid JSON only, no markdown, no code fences. Use this exact structure:
{
  "name": "Product Name",
  "description": "A compelling 2-3 sentence description of the product",
  "techStack": ["Tech1", "Tech2"],
  "features": ["Feature 1", "Feature 2"],
  "targetAudience": "Who this product is for",
  "uniqueSellingPoints": ["USP1", "USP2"]
}`;

export function analyzeUserPrompt(treeStr: string, filesStr: string): string {
  return `Analyze this codebase and give me a product analysis.

FILE TREE:
${treeStr}

KEY FILES:
${filesStr}`;
}

// ── Feedback analysis ─────────────────────────────────────────────────────────

export const FEEDBACK_SYSTEM = `You are an expert product manager and user feedback analyst. Your job is to:
1. Analyze user feedback to identify patterns, sentiment, and actionable insights
2. Generate specific, actionable developer prompts that can be given directly to an AI coding agent

Respond with valid JSON only, no markdown, no code fences:
{
  "overallSentiment": "positive" | "neutral" | "negative" | "mixed",
  "sentimentBreakdown": {
    "positive": <percentage as number 0-100>,
    "neutral": <percentage as number 0-100>,
    "negative": <percentage as number 0-100>
  },
  "themes": ["Theme 1", "Theme 2"],
  "featureRequests": ["Feature request 1", "Feature request 2"],
  "bugs": ["Bug report 1", "Bug report 2"],
  "praises": ["What users love 1", "What users love 2"],
  "developerPrompts": [
    "Implement X feature by adding Y to Z file. The user expects...",
    "Fix the bug where... by modifying the... component to handle...",
    "Improve the UX of... by adding... The user feedback suggests..."
  ]
}

IMPORTANT: The developerPrompts should be SPECIFIC, ACTIONABLE prompts that a developer can directly give to an AI coding agent (like Copilot or Cursor). Each prompt should:
- Describe exactly what to implement or fix
- Reference specific components or areas if possible
- Include the user's perspective and expected behavior
- Be self-contained so the AI agent has full context`;

export function feedbackUserPrompt(feedbackStr: string): string {
  return `Analyze the following user feedback and generate developer prompts:\n\n${feedbackStr}`;
}

// ── Marketing content ─────────────────────────────────────────────────────────

export const MARKETING_SYSTEM = {
  instagram: `You are an expert Instagram marketing strategist. Given a product analysis, generate a single Instagram Reel post.

Respond with valid JSON only, no markdown, no code fences:
{
  "caption": "The full caption with emojis, line breaks, and a call-to-action",
  "hashtags": "30 relevant hashtags separated by spaces"
}`,

  tiktok: `You are an expert TikTok content strategist. Given a product analysis, generate a TikTok video post.

Respond with valid JSON only, no markdown, no code fences:
{
  "caption": "TikTok caption with emojis, trending and punchy",
  "hashtags": "15 trending and relevant hashtags"
}`,

  'google-ads': `You are an expert Google Ads specialist. Given a product analysis, generate Google Ads content.

Respond with valid JSON only, no markdown, no code fences:
{
  "headline1": "Headline 1 (max 30 characters)",
  "headline2": "Headline 2 (max 30 characters)",
  "headline3": "Headline 3 (max 30 characters)",
  "description1": "Description line 1 (max 90 characters)",
  "description2": "Description line 2 (max 90 characters)",
  "keywords": "10 target keywords, comma-separated",
  "negativeKeywords": "5 negative keywords to exclude",
  "displayUrl": "Suggested display URL path",
  "callToAction": "Recommended CTA"
}`,
} as const;

export function marketingUserPrompt(
  name: string,
  description: string,
  techStack: string[],
  features: string[],
  targetAudience: string,
  uniqueSellingPoints: string[],
  customPrompt?: string,
): string {
  return `Generate marketing content for this product:

Product: ${name}
Description: ${description}
Tech Stack: ${techStack.join(', ')}
Key Features: ${features.join(', ')}
Target Audience: ${targetAudience}
Unique Selling Points: ${uniqueSellingPoints.join(', ')}
${customPrompt ? `\nUser's Custom Instructions: ${customPrompt}\nMAKE SURE TO FOLLOW THESE INSTRUCTIONS CLOSELY.` : ''}`;
}

// ── Image / Video generation ──────────────────────────────────────────────────

export function imageGenerationPrompt(
  productName: string,
  productDescription: string,
  format: string,
  customPrompt?: string,
): string {
  return `Create a stunning social media marketing post image for "${productName}".
The product is: ${productDescription}.
Format: ${format}
Style: ADAPT THE VIBE. The visual aesthetic MUST perfectly match the vibe of the product itself. Do not force a "clean, premium, or classy" look if the product is playful, retro, or chaotic. If the product is a retro pixel art app, make the image look like high-quality pixel art. If it's a sleek finance tool, make it look minimalist and professional.
The image should visually represent what this product does using creative, stylized illustrations or photography — NOT code, NOT screenshots, NOT terminal windows.
Think conceptual and artistic: use visual metaphors, icons, or stylized graphics that instantly communicate the product's purpose and vibe at a glance.
Include the product name "${productName}" as clean, fitting typography that is organically part of the design.
Make it look like a highly-converting, viral social media ad.
No placeholder text, no lorem ipsum, no garbled text.
${customPrompt ? `\nUSER SPECIFIC INSTRUCTIONS: ${customPrompt}\nMAKE SURE TO FOLLOW THESE INSTRUCTIONS.` : ''}`;
}

// ── Video: Step 1 — Gemini writes the cinematic brief ────────────────────────

export function videoBriefWriterPrompt(
  analysis: { name: string; description: string; features: string[]; targetAudience: string; uniqueSellingPoints: string[] },
  platform: 'instagram' | 'tiktok' | 'google-ads',
  customPrompt?: string,
): string {
  const platformLabel = platform === 'tiktok' ? 'TikTok' : platform === 'google-ads' ? 'Google Ad' : 'Instagram Reel';
  const orientation = platform === 'google-ads' ? '16:9 horizontal' : '9:16 vertical';
  const duration = platform === 'google-ads' ? '15 seconds' : '8 seconds';

  return `You are a world-class video director specializing in performance marketing. Your job is to write a precise, cinematic video generation prompt for an AI video model (Google Veo).

You will be given a product brief. You must write a single prompt paragraph (200–350 words) that describes the exact video Veo should generate — shot by shot, visually concrete, emotionally resonant, and 100% tied to THIS specific product.

PRODUCT BRIEF:
- Name: "${analysis.name}"
- What it does: ${analysis.description}
- Core features: ${analysis.features.join(' | ')}
- Who it's for: ${analysis.targetAudience}
- Why it wins: ${analysis.uniqueSellingPoints.join(' | ')}
${customPrompt ? `- Creator's specific direction: ${customPrompt}` : ''}

PLATFORM: ${platformLabel} | ${orientation} | ${duration}

YOUR OUTPUT MUST:
1. Open with the camera setup and first shot — be specific (e.g. "Close-up of a barista's hands...", "Wide shot of a cluttered desk at 2am...", "Overhead shot of a runner's feet hitting wet pavement...")
2. Describe 3–4 distinct scene beats that follow the arc: PROBLEM → TRANSFORMATION → OUTCOME → PAYOFF
3. Specify lighting, color palette, camera movement, and pace that match the product's personality
4. Reference concrete real-world objects, people, environments, or abstract visuals that directly represent what this product does or who it's for — never generic
5. End with the emotional feeling the viewer should have in the last 2 seconds

HARD RULES:
- NEVER describe UI, screens, apps, dashboards, or interfaces of any kind
- NEVER use text overlays, logos, or captions
- NEVER use clichés: no handshakes, no whiteboard pointing, no generic "team meeting", no city skyline filler
- Every visual must be traceable to a specific line in the product brief
- Write in present tense, as a direct instruction to the camera

Respond with ONLY the video prompt text — no preamble, no explanation, no title.`;
}

// ── Video: Step 2 — Veo execution prompt (wraps Gemini's output) ──────────────

export function videoGenerationPrompt(
  cinematicBrief: string,
  platform: 'instagram' | 'tiktok' | 'google-ads',
): string {
  const orientation = platform === 'google-ads' ? '16:9 horizontal' : '9:16 vertical';
  return `${cinematicBrief}

Technical spec: ${orientation} aspect ratio, cinematic quality, smooth motion, no text or UI elements.`;
}
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProductAnalysis } from "./storage";
import { videoBriefWriterPrompt, videoGenerationPrompt } from "./prompts";

export async function generateMarketingVideo(
  analysis: ProductAnalysis,
  platform: "instagram" | "tiktok" | "google-ads",
  customPrompt?: string,
): Promise<{ videoPath: string; mimeType: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  // Step 1: Gemini writes a concrete cinematic brief from the product analysis
  console.log("[VideoGenerator] Generating cinematic brief with Gemini...");
  const briefPrompt = videoBriefWriterPrompt(analysis, platform, customPrompt);
  const briefResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: briefPrompt }] }],
  });
  const cinematicBrief = briefResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!cinematicBrief) throw new Error("Gemini failed to generate a video brief");
  console.log("[VideoGenerator] Cinematic brief:\n", cinematicBrief);

  // Step 2: Feed the brief to Veo
  console.log("[VideoGenerator] Starting Veo video generation...");
  const veoPrompt = videoGenerationPrompt(cinematicBrief, platform);

  let operation = await ai.models.generateVideos({
    model: "veo-2.0-generate-001",
    prompt: veoPrompt,
    config: {
      aspectRatio: platform === "google-ads" ? "16:9" : "9:16",
      durationSeconds: 8,
    },
  });

  const maxWait = 300000;
  const startTime = Date.now();
  while (!operation.done) {
    if (Date.now() - startTime > maxWait) throw new Error("Video generation timed out after 5 minutes");
    console.log("[VideoGenerator] Waiting for Veo...");
    await new Promise((r) => setTimeout(r, 20000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (!operation.response?.generatedVideos?.[0]?.video) {
    throw new Error("Veo returned no video in response");
  }

  const tmpDir = path.join(os.tmpdir(), "pmai-videos");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const videoPath = path.join(tmpDir, `${platform}-${Date.now()}.mp4`);
  await ai.files.download({
    file: operation.response.generatedVideos[0].video,
    downloadPath: videoPath,
  });

  console.log(`[VideoGenerator] Video saved to ${videoPath}`);
  return { videoPath, mimeType: "video/mp4" };
}

#!/usr/bin/env node
import { GoogleGenerativeAI } from '@google/generative-ai';

const fixtures = [
  {
    name: 'feedback_analysis',
    system: 'Return JSON with overallSentiment, summary, sentimentBreakdown, themes, featureRequests, bugs, praises, developerPrompts. Be specific and actionable.',
    user: 'Feedback: "GitHub setup failed and I had no idea what to do next. The analysis was useful once it worked. Please show which commit was analyzed."',
  },
  {
    name: 'campaign_plan',
    system: 'Return a JSON campaign plan with campaignName, summary, targetAudience, keyMessages, channels, phases, contentCalendar, kpis, budgetGuidance, quickWins. Be tactical and product-specific.',
    user: 'Product: Recgon. Audience: solo founders. Goal: get 100 beta users in 30 days. Differentiator: turns repos and feedback into product strategy and developer prompts.',
  },
  {
    name: 'analytics_insights',
    system: 'Return JSON analytics insights with overallPerformance, summary, keyInsights, warnings, opportunities, recommendations, topWin, topConcern. Mention numbers.',
    user: JSON.stringify({
      dateRange: 'last 30 days',
      overview: { sessions: 420, activeUsers: 250, newUsers: 180, bounceRate: 62, averageSessionDuration: 78 },
      channels: [{ name: 'Organic Search', sessions: 210 }, { name: 'Direct', sessions: 140 }],
    }),
  },
];

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log('Set GEMINI_API_KEY to run live LLM evals. No API calls made.');
  process.exit(0);
}

const client = new GoogleGenerativeAI(apiKey);
for (const fixture of fixtures) {
  const model = client.getGenerativeModel({
    model: process.env.LLM_EVAL_MODEL ?? 'gemini-2.5-flash',
    systemInstruction: fixture.system,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 4096 },
  });
  const started = Date.now();
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fixture.user }] }],
  });
  const text = result.response.text();
  const hasNumbers = /\d/.test(text);
  const generic = /improve ux|do marketing|track metrics|engage users/i.test(text);
  console.log(`\n=== ${fixture.name} (${Date.now() - started}ms) ===`);
  console.log(`chars=${text.length} hasNumbers=${hasNumbers} genericFiller=${generic}`);
  console.log(text.slice(0, 1200));
}

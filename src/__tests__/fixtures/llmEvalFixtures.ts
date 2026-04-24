export const llmEvalFixtures = {
  codebaseAnalysis: {
    tree: 'package.json\nsrc/app/page.tsx\nsrc/app/api/projects/route.ts\nsrc/lib/storage.ts\nsrc/lib/auth.ts',
    files: `--- package.json ---
{"dependencies":{"next":"16.2.1","@supabase/supabase-js":"2.101.0"}}

--- src/app/api/projects/route.ts ---
ROLE: API route / backend workflow
Creates projects, verifies team access, and stores project metadata.

--- src/lib/storage.ts ---
ROLE: storage / data access
Stores projects, analyses, campaigns, and feedback analyses in Supabase.`,
  },
  ideaAnalysis: {
    description:
      'A tool for solo founders that reviews their GitHub repository and user feedback, then produces product strategy, pricing advice, and developer prompts.',
  },
  feedbackAnalysis: {
    feedback: [
      'GitHub setup failed and I had no idea what to do next.',
      'The analysis was useful once it worked, especially the next steps.',
      'Please show which commit was analyzed so I can trust the result.',
    ],
  },
  campaignPlan: {
    product:
      'Recgon turns repositories and user feedback into product strategy, campaign ideas, and developer prompts for solo founders.',
    goal: 'Get 100 beta users in 30 days.',
  },
  analyticsInsights: {
    data: {
      dateRange: 'last 30 days',
      overview: { sessions: 420, activeUsers: 250, newUsers: 180, bounceRate: 62, averageSessionDuration: 78 },
      channels: [{ name: 'Organic Search', sessions: 210 }, { name: 'Direct', sessions: 140 }],
    },
  },
  mentorChat: {
    message: 'Should I build more analytics features or focus on onboarding first?',
    knownContext:
      'Project has useful analysis output, but recent feedback says GitHub setup fails silently and users cannot tell which commit was analyzed.',
  },
};

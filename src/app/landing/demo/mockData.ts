export const demoTeam = { name: 'Acme Labs' };

export interface CompetitorInsight {
  name: string;
  url?: string;
  summary: string;
  positioning: string;
  messagingTone: string;
  keyFeatures: string[];
  weaknesses: string[];
  differentiator: string;
}

export interface DemoAnalysis {
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  analyzedAt: string;
  problemStatement: string;
  marketOpportunity: string;
  competitorInsights: CompetitorInsight[];
  businessModel: string;
  revenueStreams: string[];
  pricingSuggestion: string;
  currentStage: 'idea' | 'mvp' | 'beta' | 'growth' | 'mature';
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  topRisks: string[];
  prioritizedNextSteps: string[];
  gtmStrategy: string;
  earlyAdopterChannels: string[];
  growthMetrics: string[];
}

export interface DemoProject {
  id: string;
  name: string;
  description: string;
  techStack: string[];
  analyzed: boolean;
  hasUpdates?: boolean;
  analysis: DemoAnalysis;
}

export const demoProjects: DemoProject[] = [
  {
    id: 'tasksurge',
    name: 'TaskSurge',
    description: 'AI task manager that schedules your day from plain-text goals.',
    techStack: ['Next.js', 'Supabase', 'OpenAI', 'Vercel'],
    analyzed: true,
    hasUpdates: true,
    analysis: {
      name: 'TaskSurge',
      description:
        'TaskSurge converts plain-text weekly goals into a concrete, time-boxed daily plan. Users dump braindumps in the morning; TaskSurge produces a ranked schedule with deep-work blocks and admin windows.',
      techStack: ['Next.js 15', 'TypeScript', 'Supabase Postgres', 'OpenAI GPT-4o', 'Vercel Edge'],
      features: [
        'Natural-language goal capture',
        'Daily plan generator with priority ranking',
        'Calendar sync (Google, Apple)',
        'Focus timer with break reminders',
        'Weekly retrospective report',
      ],
      targetAudience: 'Solo founders, freelancers, and knowledge workers who struggle to translate long to-do lists into executable daily schedules.',
      uniqueSellingPoints: [
        'No rigid task entry — just write what you want to do',
        'Learns your focus hours from completed-task patterns',
        'Zero-config onboarding: usable in under 60 seconds',
      ],
      analyzedAt: '2026-04-17T10:00:00Z',
      problemStatement: 'Knowledge workers lose 2+ hours daily context-switching between task managers, calendars, and note apps. Existing tools require rigid structure upfront — exactly what anxious, overloaded users can\'t provide.',
      marketOpportunity: 'The global productivity software market is $102B and growing 13% YoY. The AI-native layer is nascent — most incumbents bolt AI on. A zero-friction daily planner built AI-first has a clear 12-month window before Motion, Todoist, and Apple close the gap.',
      competitorInsights: [
        {
          name: 'Motion',
          url: 'https://usemotion.com',
          summary: 'AI-powered calendar scheduler with auto-scheduling for tasks and meetings. Enterprise-leaning, $19/mo minimum.',
          positioning: 'Automated work OS for busy professionals',
          messagingTone: 'Professional, feature-heavy',
          keyFeatures: ['Auto-scheduling', 'Meeting booking', 'Project management', 'Team collaboration'],
          weaknesses: ['Complex onboarding (30+ min)', 'Overkill for solo users', 'No braindump input — requires structured tasks'],
          differentiator: 'TaskSurge wins on time-to-value: 60s vs Motion\'s 30min setup. Our braindump input is the killer feature Motion can\'t copy without a full redesign.',
        },
        {
          name: 'Reclaim.ai',
          url: 'https://reclaim.ai',
          summary: 'Calendar-first scheduling assistant. Syncs habits, tasks, and meetings into Google Calendar automatically.',
          positioning: 'Smart calendar for high-performers',
          messagingTone: 'Productivity-focused, polished',
          keyFeatures: ['Habit scheduling', 'Task auto-blocking', 'Slack integration', 'Smart 1:1 scheduling'],
          weaknesses: ['Google Calendar dependency', 'No goal/braindump capture', 'Weak mobile experience'],
          differentiator: 'TaskSurge is platform-agnostic and starts from goals — not calendar slots. Users who journal or braindump will prefer our input model.',
        },
      ],
      businessModel: 'Freemium SaaS. Free tier is sticky (daily ritual) and acts as the primary acquisition channel. Paid unlocks unlimited plans, calendar sync, and focus analytics.',
      revenueStreams: [
        'Pro subscription: $9/mo or $79/yr',
        'Team seats: $6/seat/mo (5-seat minimum)',
        'API access for enterprise integrations: custom pricing',
      ],
      pricingSuggestion: 'Keep free at 30 plans/month — generous enough to form a habit, constrained enough to convert heavy users. Introduce an annual plan at $79 (vs $108/yr monthly) to improve cashflow. Add a $6/seat team tier at 5-seat minimum.',
      currentStage: 'beta',
      swot: {
        strengths: ['Fast onboarding (sub-60s)', 'Sticky daily ritual', 'Low infra cost per user', 'Strong organic word-of-mouth from IndieHackers'],
        weaknesses: ['No mobile app yet', 'English-only', 'Single-user only — no teams', 'Free→paid conversion at 6% (needs work)'],
        opportunities: ['ADHD-focused niche — underserved and high-LTV', 'Calendar app integrations', 'Notion/Linear exports', 'B2B team tier'],
        threats: ['Todoist + AI features shipping Q2', 'Raycast AI commands eating power-user segment', 'Native Apple Intelligence in iOS 19'],
      },
      topRisks: [
        'LLM cost spikes if usage outpaces monetization — need a cost-per-plan ceiling now',
        'Apple/Google releasing native equivalents within 9 months',
        'Churn if daily plan quality degrades silently — need quality scoring',
        'Single-founder bus factor on core planning algorithm',
      ],
      prioritizedNextSteps: [
        'Ship recurring tasks (1 boolean + cron) — #1 feature request, 2-day scope',
        'Fix plan-duplication bug on refresh before it kills trust',
        'Add annual pricing option to reduce churn and improve cashflow',
        'Launch mobile-web plan view (PWA-first, no native app needed)',
        'Instrument free→paid funnel with PostHog to find the conversion leak',
      ],
      gtmStrategy: 'Lead with the braindump use case — it\'s the most differentiated and most shareable moment. Content strategy: show messy braindump → clean day in 8 seconds. Ship a free tier that\'s genuinely useful to build a massive top of funnel, then convert heavy users with analytics and calendar sync.',
      earlyAdopterChannels: [
        'IndieHackers (already active, high trust)',
        'r/productivity and r/ADHD (high intent, underserved)',
        'Hacker News "Show HN" for the braindump → plan demo',
        'Twitter/X founders building in public',
        'ProductHunt launch (time with a feature drop)',
      ],
      growthMetrics: [
        'Day-7 retention (target: >40%)',
        'Plans generated per active user per week (target: 5+)',
        'Free → paid conversion rate (target: 12%)',
        'Monthly churn on paid (target: <4%)',
        'Organic referral rate (target: 1 referral per 8 paid users)',
      ],
    },
  },
  {
    id: 'loopbrief',
    name: 'LoopBrief',
    description: 'Turn raw customer calls into structured product briefs in minutes.',
    techStack: ['Remix', 'Deepgram', 'Anthropic', 'Postgres'],
    analyzed: true,
    analysis: {
      name: 'LoopBrief',
      description:
        'LoopBrief ingests recorded sales and support calls, transcribes them, and outputs a structured brief: pain points, feature asks, objections, and quotes — ready for Linear or Notion.',
      techStack: ['Remix', 'Deepgram', 'Anthropic Claude', 'Postgres', 'Fly.io'],
      features: [
        'Drag-and-drop audio upload',
        'Auto-transcription with speaker labels',
        'Pain-point + feature-request extraction',
        'Quote highlights with timestamps',
        'Linear / Notion export',
      ],
      targetAudience: 'Product managers and founders at B2B SaaS companies doing 5+ customer calls per week who need to synthesize feedback into actionable product decisions.',
      uniqueSellingPoints: [
        'Briefs grounded in actual customer quotes — no hallucination',
        'Team-wide library of searchable calls',
        'Works with any recording tool (Zoom, Gong, Fathom)',
      ],
      analyzedAt: '2026-04-15T10:00:00Z',
      problemStatement: 'PMs spend 3–5 hours per week manually rewatching calls and writing briefs. Key insights get lost, decisions aren\'t traceable, and junior PMs miss patterns that senior ones catch.',
      marketOpportunity: 'The conversation intelligence market is $1.4B, dominated by Gong ($7.25B valuation) targeting sales. The product feedback layer — turning calls into structured briefs — is wide open. Every B2B SaaS team with >10 people is a potential buyer.',
      competitorInsights: [
        {
          name: 'Gong',
          url: 'https://gong.io',
          summary: 'Enterprise revenue intelligence platform. Focused on sales coaching and deal risk, not product briefs.',
          positioning: 'Revenue intelligence for enterprise sales',
          messagingTone: 'Enterprise, ROI-driven, expensive',
          keyFeatures: ['Call recording', 'Sales coaching AI', 'Deal risk scoring', 'CRM sync'],
          weaknesses: ['$100k+ ACV, not accessible to startups', 'No product-brief output', 'Requires dedicated CS team to implement'],
          differentiator: 'LoopBrief is for PMs, not sales reps. Gong can\'t pivot to structured briefs without alienating their sales-focused positioning.',
        },
        {
          name: 'Dovetail',
          url: 'https://dovetailapp.com',
          summary: 'User research repository with manual tagging and insight synthesis. Well-designed but requires significant manual effort.',
          positioning: 'Customer insights hub for product teams',
          messagingTone: 'Design-forward, collaborative',
          keyFeatures: ['Research repository', 'Manual tagging', 'Highlight reels', 'Insight board'],
          weaknesses: ['Heavy manual work — no automated extraction', 'Slow time-to-insight', 'Expensive for small teams ($0 to $200+/mo)'],
          differentiator: 'LoopBrief is 10x faster: upload a call, get a brief in 3 minutes. Dovetail requires 30+ minutes of tagging for the same output.',
        },
      ],
      businessModel: 'Usage-based SaaS with a team seat floor. Charge per call transcribed above a free tier, with team features unlocked on paid plans.',
      revenueStreams: [
        'Starter: $49/mo — 20 calls/mo, 1 user',
        'Team: $149/mo — 100 calls/mo, 10 seats, export integrations',
        'Enterprise: custom — unlimited calls, SSO, data residency',
      ],
      pricingSuggestion: 'Start with a 5 free calls/mo trial — enough to get one genuine "aha" moment. Starter at $49/mo is the right floor for a solo PM. Consider a per-call overage at $2/call rather than hard-blocking users at the limit.',
      currentStage: 'mvp',
      swot: {
        strengths: ['High-value output (saves 3-5hrs/week)', 'Clear ROI pitch', 'Sticky for PM workflows', 'Low churn once embedded in process'],
        weaknesses: ['Slow first-value (upload + transcribe takes 3 min)', 'Expensive per call at scale', 'Requires good audio quality', 'No async/batch processing yet'],
        opportunities: ['Enterprise sales teams doing win/loss calls', 'CS-ops teams tracking churn signals', 'Gong/Chorus partnership or acquisition play', 'Slack/Linear native integrations'],
        threats: ['Gong adding generative brief output', 'ChatGPT with audio input + custom instructions', 'Otter.ai expanding into structured summaries'],
      },
      topRisks: [
        'Transcription accuracy on non-native accents — needs human fallback option',
        'Data retention and compliance requirements blocking enterprise deals',
        'Deepgram pricing changes making unit economics negative at scale',
        'Gong announcing a "product insights" feature at their next conference',
      ],
      prioritizedNextSteps: [
        'Add async processing — don\'t block the UI during transcription',
        'Build Linear integration — it\'s the #1 requested export target',
        'Ship team library with search — makes the product 10x stickier',
        'Add a 5-call free trial with no credit card required',
        'Record a 90-second demo video for the landing page',
      ],
      gtmStrategy: 'Target PMs at Series A-C SaaS companies via LinkedIn and product communities. Use case studies as primary content: "how we ship features from 5 calls a week". Get 3 design partners to provide testimonials before the public launch.',
      earlyAdopterChannels: [
        'LinkedIn outbound to heads of product at Series A–C SaaS',
        'Lenny\'s Newsletter / Lenny\'s Slack (high-intent PM audience)',
        'ProductHunt launch (coordinate with a feature drop)',
        'Content: "5 things we learned from 100 customer calls" case study series',
        'Founder-mode Twitter: build in public with real call insights',
      ],
      growthMetrics: [
        'Calls processed per team per week (target: 10+)',
        'Brief-to-Linear-ticket conversion rate (target: >30%)',
        'Team activation rate (target: 3+ members using within 30 days)',
        'Monthly churn on paid (target: <3% — high-switching-cost product)',
        'NPS (target: >50 — if the brief is good, users love it)',
      ],
    },
  },
];

export const demoDashboard = {
  brief:
    "TaskSurge signups jumped 38% this week — the ProductHunt teaser drove it. LoopBrief is quieter but retention is up. Next focus: ship the mobile-web plan view for TaskSurge.",
  pulse: [
    { label: 'Signups (7d)', value: '412', delta: '+38%' },
    { label: 'Active users', value: '1,284', delta: '+11%' },
    { label: 'MRR', value: '$2,140', delta: '+6%' },
  ],
  priorityActions: [
    { project: 'TaskSurge', title: 'Ship mobile-web plan view', priority: 'high' as const },
    { project: 'TaskSurge', title: 'Add rate limiting to /api/plan', priority: 'high' as const },
    { project: 'LoopBrief', title: 'Reply to 3 feature requests in the feedback queue', priority: 'med' as const },
    { project: 'TaskSurge', title: 'Write a retrospective changelog post', priority: 'low' as const },
  ],
  signals: [
    { t: '2h ago', text: 'New feedback: "Love it — please add recurring tasks."' },
    { t: '5h ago', text: 'Spike in /pricing visits from Twitter referral.' },
    { t: '1d ago', text: 'GitHub: 3 new commits on TaskSurge main.' },
    { t: '2d ago', text: 'LoopBrief: 2 new signups from the latest case study.' },
  ],
};

export const demoFeedback = {
  sentiment: 'positive',
  sentimentBreakdown: { positive: 62, neutral: 26, negative: 12 },
  themes: ['onboarding', 'daily planning', 'mobile', 'calendar sync', 'focus timer'],
  featureRequests: [
    'Recurring tasks that auto-schedule',
    'Dark mode for the plan view',
    "Export today's plan as a single Notion block",
    'Siri shortcut to add a goal',
  ],
  bugs: [
    'Plan occasionally duplicates the last block on refresh',
    'Calendar sync breaks if the Google token expires mid-session',
  ],
  praises: [
    'The morning braindump is a killer feature — I actually use it',
    'Feels instant compared to Motion',
    'Onboarding was 30 seconds, no setup forms',
  ],
  developerPrompts: [
    "Add a `recurring` boolean to the Task schema and a cron that re-inserts daily/weekly tasks into tomorrow's plan.",
    'Implement a Google token refresh guard: before each calendar sync call, check expiry and refresh silently if <60s left.',
    'Audit the plan generator for idempotency — ensure a refresh with the same input never appends a duplicate block.',
  ],
};

export interface CampaignPlan {
  campaignName: string;
  summary: string;
  targetAudience: {
    primary: string;
    secondary: string;
    painPoints: string[];
    motivations: string[];
  };
  keyMessages: string[];
  channels: Array<{
    platform: string;
    strategy: string;
    frequency: string;
    contentTypes: string[];
    estimatedReach: string;
  }>;
  phases: Array<{
    name: string;
    duration: string;
    objective: string;
    tactics: string[];
    keyDeliverables: string[];
  }>;
  contentCalendar: Array<{
    week: number;
    platform: string;
    contentType: string;
    topic: string;
    angle: string;
    cta: string;
    suggestedFormat: string;
  }>;
  kpis: Array<{ metric: string; target: string; platform: string; timeframe: string }>;
  budgetGuidance: {
    totalRecommendation: string;
    breakdown: Array<{ channel: string; percentage: number; rationale: string }>;
  };
  quickWins: string[];
}

export const demoCampaign: CampaignPlan = {
  campaignName: 'TaskSurge Product Launch — Braindump to Plan',
  summary: 'A 1-month product-launch campaign positioning TaskSurge as the fastest path from chaotic morning thoughts to a ranked, time-boxed day. Targets indie founders and knowledge workers on social and communities.',
  targetAudience: {
    primary: 'Solo founders and freelancers aged 25–40 who work from home and struggle to prioritize daily tasks',
    secondary: 'Knowledge workers at early-stage startups who juggle deep work with admin and context-switching',
    painPoints: [
      'Spend 30+ minutes each morning figuring out what to work on',
      'To-do lists keep growing but nothing gets done',
      'Existing tools require too much setup before any value',
    ],
    motivations: [
      'Ship more with less mental overhead',
      'Feel in control of their day by 9am',
      'Adopt tools that actually stick — not productivity theater',
    ],
  },
  keyMessages: [
    'Your braindump becomes a ranked, time-boxed plan in seconds — not hours',
    'Zero setup. No forms. Just write what you want to do.',
    'Trusted by 1,200+ indie founders to ship more with less stress',
  ],
  channels: [
    {
      platform: 'Twitter / X',
      strategy: 'Build in public with real before/after braindumps. Show the product working in under 10 seconds. Engage the #indiehackers and #buildinpublic communities daily.',
      frequency: '2x daily',
      contentTypes: ['Before/after threads', 'Product demos', 'Founder takes', 'Retweet + comment'],
      estimatedReach: '12K–40K impressions/mo',
    },
    {
      platform: 'TikTok',
      strategy: 'POV-style videos showing a chaotic morning → clean day. Hook must be the chaos state in the first 1.5s. Post during commute hours.',
      frequency: '4x weekly',
      contentTypes: ['POV demos', 'Day-in-the-life', 'Productivity tips', 'Comment replies'],
      estimatedReach: '25K–80K views/mo',
    },
    {
      platform: 'ProductHunt',
      strategy: 'Launch on a Tuesday with a coordinated hunter + community push. Lead with the braindump video. Target #1 product of the day.',
      frequency: 'Launch day + 3 follow-up posts',
      contentTypes: ['Launch post', 'Maker comment thread', 'Follow-up update'],
      estimatedReach: '8K–20K unique visitors on launch day',
    },
  ],
  phases: [
    {
      name: 'Warm-Up',
      duration: 'Week 1',
      objective: 'Build anticipation and seed the audience before launch',
      tactics: [
        'Post 3 "coming soon" braindump teasers on Twitter/X',
        'Engage in r/productivity and IndieHackers threads without pitching',
        'DM 20 potential early adopters with a private beta invite',
      ],
      keyDeliverables: [
        '500+ Twitter followers engaged with teaser content',
        '20 private beta users onboarded',
        'ProductHunt hunter confirmed',
      ],
    },
    {
      name: 'Launch Blitz',
      duration: 'Week 2',
      objective: 'Maximum visibility on launch day and the 72 hours after',
      tactics: [
        'ProductHunt launch on Tuesday 12:01am PST',
        'Coordinated Twitter thread from founder with full story',
        'Post TikTok POV demo — schedule for 7am EST',
        'Respond to every comment and review within 2 hours',
      ],
      keyDeliverables: [
        'Top 5 ProductHunt on launch day',
        '300+ new signups from launch traffic',
        'TikTok video hits 10K+ views',
      ],
    },
    {
      name: 'Compound & Convert',
      duration: 'Weeks 3–4',
      objective: 'Convert launch traffic to paid, build social proof',
      tactics: [
        'Email drip to all new signups: braindump tip on day 1, plan-quality insight on day 3, upgrade offer on day 7',
        'Post 3 user testimonial threads on Twitter',
        'Publish a "lessons from 500 braindumps" long-form post on IndieHackers',
      ],
      keyDeliverables: [
        '12% free-to-paid conversion on launch cohort',
        '5 public testimonials collected',
        'IndieHackers post reaches front page',
      ],
    },
  ],
  contentCalendar: [
    { week: 1, platform: 'Twitter / X', contentType: 'Teaser', topic: 'The braindump problem', angle: 'Most to-do apps solve the wrong thing — the problem is deciding, not tracking', cta: 'Follow for the launch', suggestedFormat: 'Thread (5 tweets)' },
    { week: 1, platform: 'TikTok', contentType: 'POV video', topic: 'Chaotic morning braindump', angle: 'Show 6 messy thoughts becoming a ranked plan in 8 seconds', cta: 'Link in bio for early access', suggestedFormat: '15s vertical video' },
    { week: 2, platform: 'ProductHunt', contentType: 'Launch post', topic: 'TaskSurge launch', angle: 'Lead with the 60-second onboarding hook, not features', cta: 'Upvote + leave a review', suggestedFormat: 'Launch post + video demo' },
    { week: 2, platform: 'Twitter / X', contentType: 'Launch thread', topic: 'How TaskSurge was built', angle: 'Founder story: I wasted 2 hours/day planning. So I built this.', cta: 'Try it free today', suggestedFormat: 'Thread (8 tweets + demo GIF)' },
    { week: 3, platform: 'Twitter / X', contentType: 'Social proof', topic: 'User testimonials', angle: '"I shipped 3 features this week" — real quote from a beta user', cta: 'Start your free trial', suggestedFormat: 'Quote card + context tweet' },
    { week: 4, platform: 'TikTok', contentType: 'Results video', topic: 'Month-1 results in public', angle: '412 signups, $2.1K MRR, here\'s what worked and what didn\'t', cta: 'Join us on the journey', suggestedFormat: '60s talking-head + screen recording' },
  ],
  kpis: [
    { metric: 'New signups', target: '500+', platform: 'All channels', timeframe: 'Month 1' },
    { metric: 'ProductHunt ranking', target: 'Top 5 of the day', platform: 'ProductHunt', timeframe: 'Launch day' },
    { metric: 'Free → paid conversion', target: '≥12%', platform: 'In-app', timeframe: 'Day-7 cohort' },
    { metric: 'TikTok views', target: '50K+', platform: 'TikTok', timeframe: 'Month 1' },
    { metric: 'Twitter impressions', target: '200K+', platform: 'Twitter / X', timeframe: 'Month 1' },
    { metric: 'MRR lift', target: '+$800', platform: 'Stripe', timeframe: 'Month 1' },
  ],
  budgetGuidance: {
    totalRecommendation: '$600–900 / month',
    breakdown: [
      { channel: 'Twitter / X ads (amplify top organic posts)', percentage: 35, rationale: 'Lowest CPM for founder-audience targeting; amplify the posts already getting traction organically' },
      { channel: 'TikTok Spark Ads (boost best-performing organic)', percentage: 30, rationale: 'Spark Ads on organic content outperform standalone ads 2–3x; only boost posts hitting >5K views naturally' },
      { channel: 'ProductHunt promotion', percentage: 20, rationale: 'PH newsletter sponsorship on launch week maximizes upvote velocity in the critical first 6 hours' },
      { channel: 'Content production (video editing)', percentage: 15, rationale: 'One pro edit per week for TikTok dramatically improves watch-time and reduces churn in the first 3s' },
    ],
  },
  quickWins: [
    'Post the 8-second braindump → plan demo video today — it\'s the single highest-converting piece of content',
    'DM the top 10 productivity Twitter accounts and offer a free lifetime plan for an honest review',
    'Add "as seen on ProductHunt" badge to the landing page the morning of launch',
  ],
};

export const demoMarketing = {
  productName: 'TaskSurge',
  instagram: {
    caption:
      "Stop planning. Start shipping. TaskSurge turns your messy morning braindump into a ranked, time-boxed day — in seconds. No setup. No forms. Just write what you want to do.",
    hashtags:
      '#productivity #indiehackers #buildinpublic #saas #ai #timeblocking #focus #startup #founders',
  },
  tiktok: {
    caption:
      "POV: you open your laptop, dump 5 chaotic thoughts into TaskSurge, and it hands you a clean day back. 🫠 link in bio to try it free.",
    hashtags: '#productivitytok #aitools #founderlife #workfromhome #dayinthelife #buildinpublic',
  },
  googleAds: {
    caption:
      "TaskSurge — your AI daily planner. Write your goals in plain text. Get a ranked, time-boxed day. Free to start.",
    hashtags: '',
  },
};

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface CannedPair {
  question: string;
  answer: string;
}

// ─── Analytics mock data ──────────────────────────────────────────────────────

export interface TrendPoint { date: string; sessions: number; users: number; pageViews: number; }
export interface ChannelData { channel: string; sessions: number; percentage: number; }
export interface PageData { page: string; views: number; sessions: number; }
export interface DeviceData { device: string; sessions: number; percentage: number; }
export interface CountryData { country: string; sessions: number; }

export interface AnalyticsOverview {
  sessions: number;
  activeUsers: number;
  newUsers: number;
  screenPageViews: number;
  bounceRate: number;
  averageSessionDuration: number;
}

export interface DemoAnalyticsInsights {
  overallPerformance: 'growing' | 'stable' | 'declining' | 'insufficient_data';
  summary: string;
  keyInsights: string[];
  warnings: string[];
  opportunities: string[];
  recommendations: string[];
  topWin: string;
  topConcern: string;
}

export const demoAnalytics: {
  overview: AnalyticsOverview;
  trend: TrendPoint[];
  channels: ChannelData[];
  topPages: PageData[];
  devices: DeviceData[];
  countries: CountryData[];
  insights: DemoAnalyticsInsights;
} = {
  overview: {
    sessions: 4820,
    activeUsers: 2140,
    newUsers: 1380,
    screenPageViews: 18340,
    bounceRate: 38.4,
    averageSessionDuration: 217,
  },
  trend: [
    { date: '2026-03-20', sessions: 98,  users: 74,  pageViews: 312  },
    { date: '2026-03-21', sessions: 112, users: 88,  pageViews: 380  },
    { date: '2026-03-22', sessions: 134, users: 102, pageViews: 450  },
    { date: '2026-03-23', sessions: 145, users: 108, pageViews: 490  },
    { date: '2026-03-24', sessions: 162, users: 124, pageViews: 530  },
    { date: '2026-03-25', sessions: 178, users: 138, pageViews: 590  },
    { date: '2026-03-26', sessions: 210, users: 160, pageViews: 720  },
    { date: '2026-03-27', sessions: 196, users: 148, pageViews: 660  },
    { date: '2026-03-28', sessions: 220, users: 168, pageViews: 740  },
    { date: '2026-03-29', sessions: 185, users: 142, pageViews: 630  },
    { date: '2026-03-30', sessions: 198, users: 154, pageViews: 670  },
    { date: '2026-03-31', sessions: 215, users: 164, pageViews: 710  },
    { date: '2026-04-01', sessions: 240, users: 185, pageViews: 810  },
    { date: '2026-04-02', sessions: 228, users: 174, pageViews: 760  },
    { date: '2026-04-03', sessions: 195, users: 148, pageViews: 650  },
    { date: '2026-04-04', sessions: 182, users: 138, pageViews: 620  },
    { date: '2026-04-05', sessions: 260, users: 198, pageViews: 870  },
    { date: '2026-04-06', sessions: 318, users: 238, pageViews: 1100 },
    { date: '2026-04-07', sessions: 340, users: 258, pageViews: 1240 },
    { date: '2026-04-08', sessions: 285, users: 216, pageViews: 980  },
    { date: '2026-04-09', sessions: 264, users: 200, pageViews: 920  },
    { date: '2026-04-10', sessions: 248, users: 188, pageViews: 840  },
    { date: '2026-04-11', sessions: 270, users: 204, pageViews: 910  },
    { date: '2026-04-12', sessions: 290, users: 218, pageViews: 980  },
    { date: '2026-04-13', sessions: 245, users: 186, pageViews: 830  },
    { date: '2026-04-14', sessions: 302, users: 228, pageViews: 1020 },
    { date: '2026-04-15', sessions: 364, users: 276, pageViews: 1280 },
    { date: '2026-04-16', sessions: 418, users: 318, pageViews: 1560 },
    { date: '2026-04-17', sessions: 390, users: 298, pageViews: 1420 },
    { date: '2026-04-18', sessions: 302, users: 228, pageViews: 1040 },
  ],
  channels: [
    { channel: 'Organic Search', sessions: 1840, percentage: 38 },
    { channel: 'Direct',         sessions: 1100, percentage: 23 },
    { channel: 'Social',         sessions: 820,  percentage: 17 },
    { channel: 'Referral',       sessions: 580,  percentage: 12 },
    { channel: 'Email',          sessions: 340,  percentage: 7  },
    { channel: 'Paid Search',    sessions: 140,  percentage: 3  },
  ],
  topPages: [
    { page: '/landing',    views: 4820, sessions: 3200 },
    { page: '/',           views: 3140, sessions: 2100 },
    { page: '/pricing',    views: 1840, sessions: 1200 },
    { page: '/login',      views: 1240, sessions: 980  },
    { page: '/register',   views: 960,  sessions: 760  },
    { page: '/projects',   views: 720,  sessions: 580  },
    { page: '/marketing',  views: 480,  sessions: 380  },
    { page: '/feedback',   views: 340,  sessions: 280  },
  ],
  devices: [
    { device: 'desktop', sessions: 2890, percentage: 60 },
    { device: 'mobile',  sessions: 1446, percentage: 30 },
    { device: 'tablet',  sessions: 484,  percentage: 10 },
  ],
  countries: [
    { country: 'United States', sessions: 1928 },
    { country: 'United Kingdom', sessions: 578 },
    { country: 'Canada',         sessions: 434 },
    { country: 'Germany',        sessions: 386 },
    { country: 'Australia',      sessions: 290 },
    { country: 'India',          sessions: 252 },
    { country: 'France',         sessions: 194 },
    { country: 'Netherlands',    sessions: 166 },
  ],
  insights: {
    overallPerformance: 'growing',
    summary: 'TaskSurge is on a strong upward trajectory. The ProductHunt teaser drove a 38% spike in sessions this week — signaling strong product-market resonance with the founder audience. Retain this momentum with a polished launch.',
    keyInsights: [
      'Sessions up 38% WoW, driven primarily by a Twitter referral spike on April 15–16',
      'Organic search is the largest channel (38%) — SEO compound is already working without a content strategy',
      '/pricing page sees 34% of all sessions, indicating high purchase intent',
      'Mobile accounts for 30% of sessions but the product has no native app — a PWA could unlock a retention loop',
      'Returning-user trend suggests Day-7 retention is tracking around 41%',
    ],
    warnings: [
      'Free-to-paid conversion at 6% is 2x below the 12% target — pricing page likely has a UX leak',
      'Mobile session duration is likely 40% shorter than desktop — layout may not be optimized for small screens',
    ],
    opportunities: [
      'Email channel (7%) is underutilized — a 3-email onboarding drip could 3x this',
      'Referral traffic (12%) shows word-of-mouth is working — add a formal referral program before the launch spike fades',
      'Capture organic search intent with a /blog and productivity-tips content strategy',
    ],
    recommendations: [
      'A/B test the /pricing page headline — switch from feature-focused to outcome-focused copy',
      'Add a mobile-optimized plan view (PWA-first, no native app required)',
      'Instrument the free→paid funnel with PostHog to pinpoint the exact drop-off step',
      'Launch on ProductHunt on a Tuesday for maximum upvote velocity in the first 6 hours',
    ],
    topWin: 'Organic search driving 38% of sessions with zero paid spend — the SEO compound is kicking in just 4 months post-launch.',
    topConcern: 'Free-to-paid conversion at 6% is 2x below target. The most likely leak: annual pricing option is missing and the free-tier limit isn\'t shown above the fold on /pricing.',
  },
};

export const cannedPairs: CannedPair[] = [
  {
    question: 'What should I build next on TaskSurge?',
    answer:
      "Based on your feedback queue and retention data, the highest-leverage next build is **recurring tasks**. It's the #1 feature request (4 mentions in the last 7 days), it plugs a daily-planner gap competitors already cover, and your schema only needs one boolean + a cron to ship it. Scope it to 2 days; don't overbuild — start with daily/weekly only, skip custom intervals for v1.",
  },
  {
    question: "How's my feedback looking this week?",
    answer:
      "Sentiment is 62% positive / 26% neutral / 12% negative — up from 54% positive two weeks ago. Top themes: onboarding speed (loved), the braindump flow (loved), mobile (frustration). The only recurring bug is a plan duplication on refresh — I'd fix that this week before it eats trust.",
  },
  {
    question: 'Write me a TikTok hook for TaskSurge.',
    answer:
      '"POV: you open your laptop with 5 chaotic thoughts in your head — 8 seconds later TaskSurge hands you a clean day back." Show the messy braindump → the ranked plan in split-screen. First 1s must be the chaos state, not the logo. Lead with the user\'s pain, not your product.',
  },
  {
    question: 'Summarize my analytics.',
    answer:
      'Signups +38% WoW (412), driven almost entirely by the ProductHunt teaser. Active users +11%, MRR +6% — healthy but lagging signups, which means free→paid conversion is the bottleneck. /pricing traffic spiked from a Twitter referral yesterday; worth following up with whoever posted.',
  },
  {
    question: 'Is the /pricing page converting?',
    answer:
      "Landing→pricing is strong (34%), but pricing→checkout is only 6% — that's your leak. Two likely causes: the free-tier limit (30 plans/month) isn't shown above the fold, and the $12/mo tier has no annual option. Add both, then re-measure for a week.",
  },
  {
    question: "What's the biggest risk to TaskSurge right now?",
    answer:
      "Native Apple Intelligence and Todoist's AI rollout. You have a 6–9 month window before either reaches parity on the core braindump→plan flow. Your moat needs to be either (a) the focus-hour learning loop — ship it loudly, or (b) a niche wedge (ADHD is the obvious one). Pick one this quarter.",
  },
  {
    question: 'Draft a changelog post for this week.',
    answer:
      '**This week in TaskSurge**\n\n- Fixed the plan-duplication bug on refresh (finally 🙏)\n- Google Calendar sync now auto-refreshes expired tokens silently\n- Mobile-web plan view — you can now run your day from your phone without the janky desktop-zoom hack\n\nNext up: recurring tasks. Reply and tell me how you want them to work.',
  },
  {
    question: 'How do LoopBrief and TaskSurge compare in traction?',
    answer:
      "TaskSurge is the volume play — 412 signups this week, $2.1K MRR, self-serve. LoopBrief is the value play — fewer users but higher ACV and stickier workflows (PMs don't churn). If you can only push one, push TaskSurge now for growth and let LoopBrief compound on content. Revisit that call in 6 weeks.",
  },
];

export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const PINK = '#f0b8d0';

export const AUDIENCE = [
  'Solo Founders',
  'Small Teams',
  'Indie Hackers',
  'Early-Stage Startups',
  'Side Projects',
];

export type Feature = {
  icon: string;
  title: string;
  description: string;
};

export const features: Feature[] = [
  { icon: '{ }', title: 'Product Analysis', description: 'Paste a GitHub URL or describe your idea. Recgon builds a full product brief — stack, audience, GTM, risks — in seconds.' },
  { icon: '///', title: 'Marketing Content', description: 'Generate platform-ready copy for Instagram, TikTok, and Google Ads — all grounded in what your product actually does.' },
  { icon: '>>>', title: 'Campaign Planning', description: 'Get structured campaign timelines, content calendars, and messaging strategies tailored to your product.' },
  { icon: '<!>', title: 'Feedback Analysis', description: 'Paste user feedback or upload a CSV. Get sentiment breakdowns, themes, and actionable developer prompts.' },
  { icon: '%_', title: 'Analytics Dashboard', description: 'Track your growth with GA4-powered dashboards and AI-generated insights about your traffic and engagement.' },
  { icon: '->', title: 'AI Mentor', description: 'Chat with an AI that knows your product inside out. Ask questions, get strategy advice, brainstorm features.' },
];

export type Step = {
  number: string;
  title: string;
  description: string;
};

export const steps: Step[] = [
  { number: '01', title: 'Add Project', description: 'Paste a GitHub URL or describe your idea. That\u2019s it.' },
  { number: '02', title: 'Analyze', description: 'AI reads your repo or brief, understands your product, and builds a comprehensive profile.' },
  { number: '03', title: 'Act', description: 'Generate marketing content, plan campaigns, analyze feedback, and grow — all from one place.' },
];

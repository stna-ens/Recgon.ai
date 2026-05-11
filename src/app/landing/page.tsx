import type { Metadata } from 'next';
import Script from 'next/script';
import LandingV2Shell from '@/components/landing/LandingV2Shell';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://recgon.app';

export const metadata: Metadata = {
  title: 'Recgon — The AI Product Manager for small teams',
  description:
    'Recgon reads your codebase, GA4 analytics, and team activity — then decides what to ship next and assigns each task to the best-fit teammate.',
  keywords: [
    'AI product manager',
    'AI PM',
    'product management AI',
    'small team product tool',
    'codebase analysis AI',
    'auto task assignment',
    'ai task assignment',
    'startup product tool',
    'indie hacker pm',
    'team task scheduler',
  ],
  alternates: {
    canonical: `${BASE_URL}/landing`,
  },
  openGraph: {
    title: 'Recgon — The AI Product Manager for small teams',
    description:
      'One brain for the whole team. Recgon reads code, analytics, and team activity, then assigns the next move to the right teammate.',
    type: 'website',
    url: `${BASE_URL}/landing`,
    siteName: 'Recgon',
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Recgon — AI product manager for small teams',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recgon — The AI Product Manager for small teams',
    description:
      'Reads your codebase, analytics, and team. Decides what to ship next. Assigns it to the right teammate.',
    images: [`${BASE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      name: 'Recgon',
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/favicon.svg`,
      },
      description:
        'Recgon is an AI Product Manager for small teams. It reads codebase, GA4 analytics, and team activity, then surfaces the next move and assigns it to the best-fit teammate.',
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: 'Recgon',
      publisher: { '@id': `${BASE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Recgon',
      url: BASE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'AI Product Manager for small teams. Ingests codebase, analytics, and team activity, generates prioritized next steps, and auto-assigns tasks to teammates by skill and calendar availability.',
      featureList: [
        'Codebase analysis (GitHub) with SWOT, risks, growth levers, and ranked next steps',
        'GA4 analytics ingestion and AI-summarized insights',
        'Auto-minted task pipeline (next_step, dev_prompt, marketing, analytics, research)',
        'Skill- and calendar-aware task assignment to teammates',
        'AI task verification against acceptance criteria',
        'Cockpit home with today\'s focus, decision deck, and team pulse',
        'Slash-command terminal interface',
        'Claude Code MCP integration',
      ],
      creator: { '@id': `${BASE_URL}/#organization` },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is Recgon?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Recgon is an AI Product Manager for small teams. It reads your codebase, GA4 analytics, and team activity, then surfaces what to ship next and automatically assigns each task to the best-fit teammate by skill and calendar.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does the analysis work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Connect a GitHub repo and a GA4 property. Recgon ingests the code and the traffic, builds a running snapshot of your product (stage, SWOT, top risks, growth levers, prioritized next steps), and refreshes it whenever new commits land.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does task assignment work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Each task is scored against every active teammate by skill match, current workload, and open time on their calendar. The best fit gets assigned and pinged. If no teammate scores above the minimum fit threshold, the task is left unassigned for you to triage.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does Recgon do the work itself?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. Recgon assigns work to humans. It plans, prioritizes, schedules, and verifies — your team ships.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does Recgon integrate with Claude Code?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Recgon ships an MCP server so Claude Code can read your product analysis, pick up an actionable next step, implement it, and mark it complete — all tracked back in Recgon.',
          },
        },
      ],
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <Script
        id="recgon-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* SSR content layer: visible to crawlers and AI models, visually hidden. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
        }}
      >
        <h1>Recgon — The AI Product Manager for small teams</h1>
        <p>
          One brain for the whole team. Recgon reads your codebase, GA4 analytics, and team activity, then decides what to ship next and assigns each task to the best-fit teammate by skill match and calendar availability.
        </p>
        <h2>What Recgon does</h2>
        <ul>
          <li>Reads your GitHub codebase and produces stage, SWOT, top risks, growth levers, and a ranked next-step list per project</li>
          <li>Ingests GA4 analytics and summarizes traffic, channels, and funnel signals</li>
          <li>Mints tasks from this unified signal (next_step, dev_prompt, marketing, analytics, research)</li>
          <li>Auto-assigns each task to the best-fit teammate using skill scores and calendar availability</li>
          <li>Verifies completed work against acceptance criteria</li>
          <li>Surfaces a daily cockpit: today&apos;s focus, decision deck, team pulse, and what shipped</li>
        </ul>
        <h2>How it works</h2>
        <ol>
          <li>Connect a GitHub repo, a GA4 property, and your teammates</li>
          <li>Recgon analyzes and produces a running product snapshot</li>
          <li>Tasks land on the right teammate&apos;s calendar; you see what to ship today</li>
        </ol>
        <h2>Who it&apos;s for</h2>
        <p>
          Small teams (2-10) with a founder running product. Indie hackers, early-stage startups, and side-project teams that need a PM&apos;s strategic loop and a project manager&apos;s assignment discipline — without the headcount.
        </p>
      </div>
      <LandingV2Shell />
    </>
  );
}

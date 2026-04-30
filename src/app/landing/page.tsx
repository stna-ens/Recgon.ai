import type { Metadata } from 'next';
import Script from 'next/script';
import LandingClientShell from '@/components/landing/LandingClientShell';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://recgon.app';

export const metadata: Metadata = {
  title: "Recgon — The Coach Solo Founders Don't Have",
  description:
    'Recgon analyzes your product — from a GitHub repo or a plain-text idea — generates marketing content, plans campaigns, and turns user feedback into developer prompts, so you can stop guessing and start shipping.',
  keywords: [
    'AI for solo founders',
    'indie hacker tools',
    'product analysis AI',
    'marketing content generator',
    'feedback analysis tool',
    'AI mentor for startups',
    'product analytics AI',
    'campaign planning tool',
    'solo founder software',
    'startup growth tools',
  ],
  alternates: {
    canonical: `${BASE_URL}/landing`,
  },
  openGraph: {
    title: "Recgon — The Coach Solo Founders Don't Have",
    description:
      'AI-powered product analysis, marketing content, campaign planning, feedback analysis, and mentorship for solo founders and indie hackers.',
    type: 'website',
    url: `${BASE_URL}/landing`,
    siteName: 'Recgon',
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Recgon — AI coach for solo founders',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Recgon — The Coach Solo Founders Don't Have",
    description:
      'AI-powered product analysis, marketing content, feedback analysis, and mentorship for solo founders.',
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
        'Recgon is an AI-powered platform for solo founders and indie hackers — product analysis (from a GitHub repo or a plain-text idea), marketing content generation, campaign planning, feedback analysis, and AI mentorship.',
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: 'Recgon',
      publisher: { '@id': `${BASE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Recgon',
      url: BASE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'AI-powered product platform for solo founders. Analyzes a GitHub repo or a plain-text idea, generates marketing content for Instagram, TikTok, and Google Ads, plans campaigns, analyzes user feedback, and provides AI mentorship.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free to get started',
      },
      featureList: [
        'Product analysis via AI (GitHub repo or plain-text idea)',
        'Marketing content generation for Instagram, TikTok, and Google Ads',
        'Campaign planning and content calendars',
        'User feedback sentiment analysis',
        'GA4-powered analytics dashboard',
        'AI mentor chatbot with product context',
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
            text: 'Recgon is an AI-powered platform for solo founders and indie hackers. It analyzes your product — from a GitHub repo or a plain-text idea — generates platform-ready marketing content (Instagram, TikTok, Google Ads), plans campaigns, analyzes user feedback into actionable developer prompts, and provides an AI mentor that knows your product inside out.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does Recgon analyze your product?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "You paste a GitHub URL or describe your idea in plain text. Recgon's AI reads the repo (or brief), extracts the product's purpose, tech stack, features, and limitations, and builds a comprehensive product profile in seconds.",
          },
        },
        {
          '@type': 'Question',
          name: 'What marketing content can Recgon generate?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Recgon generates platform-ready copy for Instagram posts, TikTok captions, and Google Ads — all grounded in what your product actually does based on the product analysis. It also creates structured campaign timelines and content calendars.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does the feedback analysis work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'You paste user feedback manually or scrape Instagram comments. Recgon performs sentiment analysis and converts the feedback into actionable developer prompts so you know exactly what to build next.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does Recgon integrate with Claude Code?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Recgon ships a Claude Code MCP (Model Context Protocol) server. Claude can call list_projects(), get_actionable_items(), and mark_item_complete() — reading your product analysis, picking up next steps, implementing them, and marking them done, all tracked in Recgon.',
          },
        },
        {
          '@type': 'Question',
          name: 'Who is Recgon for?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Recgon is built for solo founders, indie hackers, small teams, early-stage startups, and side project builders who need the strategic advice of a cofounder and the execution support of a marketing team — without the headcount.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is Recgon free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, Recgon is free to get started. Create an account and begin analyzing your product right away.',
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
      {/* SSR content layer: visible to crawlers and AI models, visually hidden */}
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
        <h1>Recgon — The Coach Solo Founders Don&apos;t Have</h1>
        <p>
          Recgon analyzes your product — from a GitHub repo or a plain-text idea — generates
          marketing content, plans campaigns, and turns user feedback into developer prompts — so
          solo founders, indie hackers, and small teams can stop guessing and start shipping.
        </p>
        <h2>Features</h2>
        <ul>
          <li>Product Analysis — paste a GitHub URL or describe your idea; AI extracts a full product profile</li>
          <li>Marketing Content — Instagram, TikTok, and Google Ads copy grounded in your product</li>
          <li>Campaign Planning — timelines, content calendars, and messaging strategies</li>
          <li>Feedback Analysis — sentiment breakdowns and actionable developer prompts</li>
          <li>Analytics Dashboard — GA4-powered insights and AI-generated traffic analysis</li>
          <li>AI Mentor — chatbot with full product context for strategy and feature advice</li>
        </ul>
        <h2>How It Works</h2>
        <ol>
          <li>Add Project — paste a GitHub URL or describe your idea in plain text</li>
          <li>Analyze — AI reads your repo or brief and builds a comprehensive product profile</li>
          <li>Act — generate marketing content, plan campaigns, analyze feedback, and grow</li>
        </ol>
        <h2>Claude Code Integration</h2>
        <p>
          Recgon plugs into Claude Code via MCP. Claude reads your product analysis, picks up
          actionable next steps, implements them, and marks them done — all tracked in Recgon.
        </p>
      </div>
      <LandingClientShell />
    </>
  );
}

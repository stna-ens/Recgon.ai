import type { Metadata } from 'next';
import Script from 'next/script';
import { getTranslations } from 'next-intl/server';
import LandingV2Shell from '@/components/landing/LandingV2Shell';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://recgon.app';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.meta');
  return {
    title: t('title'),
    description: t('description'),
    keywords: t('keywords').split(',').map((k) => k.trim()),
    alternates: {
      canonical: `${BASE_URL}/landing`,
    },
    openGraph: {
      title: t('title'),
      description: t('ogDescription'),
      type: 'website',
      url: `${BASE_URL}/landing`,
      siteName: 'Recgon',
      images: [
        {
          url: `${BASE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: t('ogImageAlt'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('twitterDescription'),
      images: [`${BASE_URL}/og-image.png`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  };
}

export default async function LandingPage() {
  const t = await getTranslations('landing');

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
        description: t('jsonld.orgDescription'),
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
        description: t('jsonld.appDescription'),
        featureList: [
          t('jsonld.feature1'),
          t('jsonld.feature2'),
          t('jsonld.feature3'),
          t('jsonld.feature4'),
          t('jsonld.feature5'),
          t('jsonld.feature6'),
          t('jsonld.feature7'),
          t('jsonld.feature8'),
        ],
        creator: { '@id': `${BASE_URL}/#organization` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: t('faq.q1.q'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: t('faq.q1.a'),
            },
          },
          {
            '@type': 'Question',
            name: t('faq.q2.q'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: t('faq.q2.a'),
            },
          },
          {
            '@type': 'Question',
            name: t('faq.q3.q'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: t('faq.q3.a'),
            },
          },
          {
            '@type': 'Question',
            name: t('faq.q4.q'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: t('faq.q4.a'),
            },
          },
          {
            '@type': 'Question',
            name: t('jsonld.faqClaudeQ'),
            acceptedAnswer: {
              '@type': 'Answer',
              text: t('faq.q5.a'),
            },
          },
        ],
      },
    ],
  };

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
        <h1>{t('seo.h1')}</h1>
        <p>{t('seo.intro')}</p>
        <h2>{t('seo.whatHeading')}</h2>
        <ul>
          <li>{t('seo.what.item1')}</li>
          <li>{t('seo.what.item2')}</li>
          <li>{t('seo.what.item3')}</li>
          <li>{t('seo.what.item4')}</li>
          <li>{t('seo.what.item5')}</li>
          <li>{t('seo.what.item6')}</li>
        </ul>
        <h2>{t('seo.howHeading')}</h2>
        <ol>
          <li>{t('seo.how.step1')}</li>
          <li>{t('seo.how.step2')}</li>
          <li>{t('seo.how.step3')}</li>
        </ol>
        <h2>{t('seo.whoHeading')}</h2>
        <p>{t('seo.who')}</p>
      </div>
      <LandingV2Shell />
    </>
  );
}

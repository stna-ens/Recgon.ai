import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider } from '@/components/ui';
import { Analytics } from '@vercel/analytics/next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

// Default metadata for every non-landing URL (login, register, app pages).
// Mirrors the landing surface's AI-Product-Manager positioning so shared
// links never show retired copy.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.meta');
  return {
    // Required for Next.js to generate absolute OG image URLs that WhatsApp /
    // Telegram / Twitter scrapers can actually fetch.
    metadataBase: new URL('https://recgon.app'),
    icons: {
      icon: '/favicon.svg',
      shortcut: '/favicon.svg',
    },
    title: {
      default: t('title'),
      template: '%s | Recgon',
    },
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('ogDescription'),
      type: 'website',
      url: 'https://recgon.app',
      siteName: 'Recgon',
      images: [
        {
          url: '/opengraph-image',
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
      images: ['/opengraph-image'],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// viewport-fit=cover lets iOS Safari paint the page under the dynamic
// island / notch. Combined with env(safe-area-inset-*) padding on the
// mobile hero, this removes the flat black bar at the top.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProvider>
          <NextIntlClientProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <div className="mesh-bg"></div>
              <ToastProvider>
                <ConfirmProvider>
                  <AppShell>{children}</AppShell>
                </ConfirmProvider>
              </ToastProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </SessionProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}

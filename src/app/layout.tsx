import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider } from '@/components/ui';
import { Analytics } from '@vercel/analytics/next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';

export const metadata: Metadata = {
  // Required for Next.js to generate absolute OG image URLs that WhatsApp /
  // Telegram / Twitter scrapers can actually fetch.
  metadataBase: new URL('https://recgon.app'),
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  title: {
    default: 'Recgon — The Coach Solo Founders Don\'t Have',
    template: '%s | Recgon',
  },
  description: 'Recgon is the mentor and cofounder in your corner — analyzes your product, plans campaigns, and tells you the truth.',
  openGraph: {
    title: 'Recgon — The Coach Solo Founders Don\'t Have',
    description: 'AI-powered product strategy, marketing content, and mentorship for solo founders.',
    type: 'website',
    url: 'https://recgon.app',
    siteName: 'Recgon',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Recgon — The Coach Solo Founders Don\'t Have',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recgon — The Coach Solo Founders Don\'t Have',
    description: 'AI-powered product strategy, marketing content, and mentorship for solo founders.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
              <div className="mesh-bg">
                <div className="mesh-blob mesh-blob-1"></div>
                <div className="mesh-blob mesh-blob-2"></div>
                <div className="mesh-blob mesh-blob-3"></div>
              </div>
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

import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/components/Toast';
import { Analytics } from '@vercel/analytics/next';

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
  description: 'Recgon is the mentor and cofounder in your corner — analyzes your product, plans campaigns, reads your feedback, and tells you the truth.',
  openGraph: {
    title: 'Recgon — The Coach Solo Founders Don\'t Have',
    description: 'AI-powered product strategy, marketing content, feedback analysis, and mentorship for solo founders.',
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
    description: 'AI-powered product strategy, marketing content, feedback analysis, and mentorship for solo founders.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <div className="mesh-bg">
              <div className="mesh-blob mesh-blob-1"></div>
              <div className="mesh-blob mesh-blob-2"></div>
              <div className="mesh-blob mesh-blob-3"></div>
            </div>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </ThemeProvider>
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
}

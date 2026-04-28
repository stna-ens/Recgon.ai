import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/components/Toast';
import { Analytics } from '@vercel/analytics/next';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
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
    siteName: 'Recgon',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Recgon — The Coach Solo Founders Don\'t Have',
    description: 'AI-powered product strategy, marketing content, feedback analysis, and mentorship for solo founders.',
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="view-transition" content="same-origin" />
      </head>
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

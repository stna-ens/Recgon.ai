import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';
import { ToastProvider } from '@/components/Toast';

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProvider session={session}>
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
      </body>
    </html>
  );
}

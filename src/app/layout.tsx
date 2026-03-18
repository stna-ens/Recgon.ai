import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';

export const metadata: Metadata = {
  title: 'Recgon — The Coach Solo Founders Don\'t Have',
  description: 'Recgon is the mentor and cofounder in your corner — analyzes your product, plans campaigns, reads your feedback, and tells you the truth.',
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
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import './redesign.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-fraunces',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'Recgon — Redesign Preview',
  description: 'A vintage-editorial product manager workspace, in preview.',
  robots: { index: false, follow: false },
};

export default function RedesignLayout({ children }: { children: React.ReactNode }) {
  const fontVars = `${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`;
  return (
    <div className={`recgon-v2 ${fontVars}`}>
      {children}
    </div>
  );
}

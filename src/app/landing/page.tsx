import type { Metadata } from 'next';
import LandingClientShell from '@/components/landing/LandingClientShell';

export const metadata: Metadata = {
  title: "Recgon — The Coach Solo Founders Don't Have",
  description: 'AI-powered codebase analysis, marketing content generation, campaign planning, and feedback analysis for solo founders and indie hackers.',
};

export default function LandingPage() {
  return <LandingClientShell />;
}

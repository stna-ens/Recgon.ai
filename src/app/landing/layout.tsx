import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recgon — The Coach Solo Founders Don\'t Have',
  description: 'AI-powered codebase analysis, marketing content, feedback analysis, and mentorship for solo founders.',
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        body {
          display: block !important;
          overflow: auto !important;
          min-height: 100vh;
          background: #000;
        }
      `}</style>
      {children}
    </>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recgon Alt Landing',
  description: 'Alternative modern landing concept for Recgon.',
};

export default function LandingAltLayout({ children }: { children: React.ReactNode }) {
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

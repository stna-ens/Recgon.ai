'use client';

import { useEffect, useState } from 'react';
import LandingNav from './LandingNav';
import HeroSection from './sections/HeroSection';
import PipelineDiagram from './PipelineDiagram';
import CapabilitiesSection from './sections/CapabilitiesSection';
import HowItWorksSection from './sections/HowItWorksSection';
import TerminalPreviewSection from './sections/TerminalPreviewSection';
import FaqSection from './sections/FaqSection';
import FooterCta from './sections/FooterCta';
import MobileLanding from './MobileLanding';

const MOBILE_BREAKPOINT = 768;

export default function LandingV2Shell() {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (mounted && isMobile) return <MobileLanding />;

  return (
    <div className="lnd-root">
      <LandingNav />

      <main className="lnd-main">
        <HeroSection />
        <PipelineDiagram />
        <CapabilitiesSection />
        <HowItWorksSection />
        <TerminalPreviewSection />
        <FaqSection />
        <FooterCta />
      </main>

      <style>{`
        .lnd-root {
          position: relative;
          min-height: 100vh;
          background: var(--bg-deep);
          color: var(--txt-pure);
          overflow-x: hidden;
        }
        .lnd-main {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  );
}

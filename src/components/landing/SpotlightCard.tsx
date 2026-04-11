'use client';

import { useRef, ReactNode } from 'react';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  style?: React.CSSProperties;
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(255, 255, 255, 0.08)',
  style,
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = divRef.current!.getBoundingClientRect();
    divRef.current!.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    divRef.current!.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    divRef.current!.style.setProperty('--spotlight-color', spotlightColor);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const rect = divRef.current!.getBoundingClientRect();
    divRef.current!.style.setProperty('--mouse-x', `${touch.clientX - rect.left}px`);
    divRef.current!.style.setProperty('--mouse-y', `${touch.clientY - rect.top}px`);
    divRef.current!.style.setProperty('--spotlight-color', spotlightColor);
    divRef.current!.setAttribute('data-touch-active', 'true');
  };

  const handleTouchEnd = () => {
    divRef.current!.removeAttribute('data-touch-active');
  };

  return (
    <>
      <style>{`
        .spotlight-card {
          position: relative;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          overflow: hidden;
          --mouse-x: 50%;
          --mouse-y: 50%;
          --spotlight-color: rgba(255,255,255,0.08);
          transition: border-color 0.3s ease, transform 0.2s ease;
          touch-action: manipulation;
        }
        .spotlight-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at var(--mouse-x) var(--mouse-y), var(--spotlight-color), transparent 70%);
          opacity: 0;
          transition: opacity 0.4s ease;
          pointer-events: none;
          z-index: 0;
        }
        /* Hover only on real pointer devices — prevents iOS sticky-hover */
        @media (hover: hover) {
          .spotlight-card:hover::before { opacity: 1; }
          .spotlight-card:hover {
            border-color: rgba(255,255,255,0.16);
            transform: translateY(-2px);
          }
        }
        /* Touch: show on press, vanish on release via data attribute */
        .spotlight-card[data-touch-active]::before {
          opacity: 1;
          transition: opacity 0.12s ease;
        }
        .spotlight-card[data-touch-active] {
          border-color: rgba(255,255,255,0.16);
          transform: translateY(-2px);
          transition: border-color 0.12s ease, transform 0.12s ease;
        }
        .spotlight-card > * {
          position: relative;
          z-index: 1;
        }
      `}</style>
      <div
        ref={divRef}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`spotlight-card ${className}`}
        style={style}
      >
        {children}
      </div>
    </>
  );
}

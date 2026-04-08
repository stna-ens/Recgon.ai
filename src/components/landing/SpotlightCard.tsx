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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    divRef.current!.style.setProperty('--mouse-x', `${x}px`);
    divRef.current!.style.setProperty('--mouse-y', `${y}px`);
    divRef.current!.style.setProperty('--spotlight-color', spotlightColor);
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
        .spotlight-card:hover::before {
          opacity: 1;
        }
        .spotlight-card:hover {
          border-color: rgba(255,255,255,0.16);
          transform: translateY(-2px);
        }
        .spotlight-card > * {
          position: relative;
          z-index: 1;
        }
      `}</style>
      <div
        ref={divRef}
        onMouseMove={handleMouseMove}
        className={`spotlight-card ${className}`}
        style={style}
      >
        {children}
      </div>
    </>
  );
}

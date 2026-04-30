'use client';

import dynamic from 'next/dynamic';
import { ReactNode } from 'react';

const ProductCompass = dynamic(() => import('./ProductCompass'), {
  ssr: false,
  loading: () => <SceneFallback />,
});

function SceneFallback() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--rg-signature) 22%, transparent), transparent 65%)',
      }}
    >
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 35% 30%, #f3e7d3, color-mix(in oklab, #f3e7d3 70%, var(--rg-paper)))',
          boxShadow: '0 30px 60px -20px rgba(20,20,20,0.18)',
        }}
      />
    </div>
  );
}

export default function SceneHost({
  corners,
}: {
  corners?: { tl?: ReactNode; tr?: ReactNode; bl?: ReactNode; br?: ReactNode };
}) {
  return (
    <div className="scene-host">
      <ProductCompass />
      {corners?.tl && <div className="scene-host__corner">{corners.tl}</div>}
      {corners?.tr && <div className="scene-host__corner scene-host__corner--right">{corners.tr}</div>}
      {corners?.bl && <div className="scene-host__corner scene-host__corner--bottom">{corners.bl}</div>}
      {corners?.br && (
        <div className="scene-host__corner scene-host__corner--right scene-host__corner--bottom">{corners.br}</div>
      )}
    </div>
  );
}

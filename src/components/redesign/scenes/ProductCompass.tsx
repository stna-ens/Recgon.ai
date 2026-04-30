'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';

/* ============================================================
   Product Compass
   A slow-rotating editorial 3D scene for the redesign hero.
   - One faceted "product" orb at the center (cream).
   - Four orbiting discipline shards (analytics, feedback, roadmap, marketing).
   - Warm directional light + soft pink rim.
   - All motion is slow and once; no springs. Reduced motion respects.
   ============================================================ */

function ProductOrb() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    m.rotation.x += delta * 0.04;
    m.rotation.y += delta * 0.07;
  });
  return (
    <Float speed={0.6} floatIntensity={0.35} rotationIntensity={0.1}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial
          color="#f3e7d3"
          roughness={0.55}
          metalness={0.06}
          flatShading
        />
      </mesh>
      {/* subtle inner glow */}
      <mesh scale={1.18}>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshBasicMaterial color="#e8a8c4" transparent opacity={0.06} />
      </mesh>
    </Float>
  );
}

function Shard({
  index,
  total,
  radius,
  color,
  size,
}: {
  index: number;
  total: number;
  radius: number;
  color: string;
  size: [number, number, number];
}) {
  const ref = useRef<THREE.Mesh>(null);
  const baseAngle = (index / total) * Math.PI * 2;

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * 0.18 + baseAngle;
    const x = Math.cos(t) * radius;
    const z = Math.sin(t) * radius;
    const y = Math.sin(t * 1.3 + index) * 0.22;
    m.position.set(x, y, z);
    // Face the center
    m.lookAt(0, 0, 0);
    m.rotation.z = baseAngle * 0.4;
  });

  return (
    <Float speed={0.8} floatIntensity={0.18} rotationIntensity={0.05}>
      <mesh ref={ref}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.08} />
      </mesh>
    </Float>
  );
}

function Constellation() {
  const tickers = useMemo(
    () => [
      { color: '#c69147', size: [0.62, 0.9, 0.04] as [number, number, number] }, // ochre
      { color: '#7d8a6e', size: [0.78, 0.7, 0.04] as [number, number, number] }, // sage
      { color: '#a04a32', size: [0.6, 0.78, 0.04] as [number, number, number] }, // rust
      { color: '#e8a8c4', size: [0.7, 0.86, 0.04] as [number, number, number] }, // pink
    ],
    [],
  );
  return (
    <group rotation={[Math.PI * -0.06, 0, 0]}>
      <ProductOrb />
      {tickers.map((t, i) => (
        <Shard key={i} index={i} total={tickers.length} radius={2.55} color={t.color} size={t.size} />
      ))}
      {/* Ambient halo dust — small spheres orbiting slowly */}
      {[0, 1, 2, 3, 4].map((i) => (
        <DustMote key={i} index={i} />
      ))}
    </group>
  );
}

function DustMote({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * 0.05 + index * 1.7;
    const r = 3.4 + (index % 2) * 0.3;
    m.position.set(Math.cos(t) * r, Math.sin(t * 0.7) * 0.6 + (index - 2) * 0.18, Math.sin(t) * r);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.025, 8, 8]} />
      <meshBasicMaterial color="#1a1614" transparent opacity={0.35} />
    </mesh>
  );
}

export default function ProductCompass() {
  // Honor reduced motion: render a static frame
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <Canvas
      camera={{ position: [0, 0.6, 5.2], fov: 30 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
      frameloop={reduced ? 'demand' : 'always'}
    >
      <ambientLight intensity={0.7} color="#fff3df" />
      <directionalLight position={[3, 4, 4]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-4, -2, -2]} intensity={0.35} color="#e8a8c4" />
      <hemisphereLight color="#fff5e8" groundColor="#1a1614" intensity={0.35} />
      <Suspense fallback={null}>
        <Constellation />
      </Suspense>
    </Canvas>
  );
}

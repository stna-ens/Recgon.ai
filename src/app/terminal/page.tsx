'use client';

import { Suspense } from 'react';
import TerminalShell from '@/components/v2/terminal/TerminalShell';
import { Skeleton } from '@/components/ui';

// Visible placeholder while TerminalShell hydrates — fallback={null} left a
// blank viewport on slow loads.
function TerminalFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '32px clamp(16px, 4vw, 48px)' }}>
      <Skeleton width="30%" height={28} />
      <Skeleton height={420} radius={12} />
      <Skeleton width="55%" height={44} radius={10} />
    </div>
  );
}

export default function V2TerminalPage() {
  return (
    <Suspense fallback={<TerminalFallback />}>
      <TerminalShell />
    </Suspense>
  );
}

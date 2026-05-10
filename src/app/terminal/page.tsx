'use client';

import { Suspense } from 'react';
import TerminalShell from '@/components/v2/terminal/TerminalShell';

export default function V2TerminalPage() {
  return (
    <Suspense fallback={null}>
      <TerminalShell />
    </Suspense>
  );
}

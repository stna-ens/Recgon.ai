'use client';

import { usePathname } from 'next/navigation';

const NO_WRAPPER_PATHS = ['/landing', '/login', '/register'];

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (NO_WRAPPER_PATHS.includes(pathname)) {
    return <>{children}</>;
  }
  return <div className="content-wrapper">{children}</div>;
}

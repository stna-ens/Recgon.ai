'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';

const AUTH_PATHS = ['/login', '/register', '/landing'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}

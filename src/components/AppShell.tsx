'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';
import TeamProvider from './TeamProvider';

const AUTH_PATHS = ['/login', '/register', '/landing'];
const TEAM_SETUP_PATHS = ['/teams/setup'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);
  const isTeamSetup = TEAM_SETUP_PATHS.includes(pathname) || pathname.startsWith('/teams/invite/');

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (isTeamSetup) {
    return <TeamProvider>{children}</TeamProvider>;
  }

  return (
    <TeamProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </TeamProvider>
  );
}

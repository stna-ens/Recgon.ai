'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import ErrorBoundary from './ErrorBoundary';
import TeamProvider from './TeamProvider';
import RouteTransitions from './RouteTransitions';

const AUTH_PATHS = ['/login', '/register', '/landing'];
const TEAM_SETUP_PATHS = ['/teams/setup'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname) || pathname === '/landing-demo';
  const isTeamSetup = TEAM_SETUP_PATHS.includes(pathname) || pathname.startsWith('/teams/invite/');
  const isExportPage = pathname.endsWith('/export');
  const isRedesignPreview = pathname === '/redesign' || pathname.startsWith('/redesign/');

  if (isAuthPage || isRedesignPreview) {
    return <>{children}</>;
  }

  if (isTeamSetup || isExportPage) {
    return <TeamProvider>{children}</TeamProvider>;
  }

  return (
    <TeamProvider>
      <RouteTransitions />
      <div className="app-layout">
        <Sidebar />
        <main className="main-content page-fade-in">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </TeamProvider>
  );
}

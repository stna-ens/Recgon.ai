'use client';

import { usePathname } from 'next/navigation';
import ErrorBoundary from './ErrorBoundary';
import TeamProvider from './TeamProvider';
import WorkspaceShell from './WorkspaceShell';

const AUTH_PATHS = ['/login', '/register', '/landing'];
const TEAM_SETUP_PATHS = ['/teams/setup'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);
  const isTeamSetup = TEAM_SETUP_PATHS.includes(pathname) || pathname.startsWith('/teams/invite/');
  const isExportPage = pathname.endsWith('/export');

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (isTeamSetup || isExportPage) {
    return <TeamProvider>{children}</TeamProvider>;
  }

  return (
    <TeamProvider>
      <ErrorBoundary>
        <WorkspaceShell>{children}</WorkspaceShell>
      </ErrorBoundary>
    </TeamProvider>
  );
}

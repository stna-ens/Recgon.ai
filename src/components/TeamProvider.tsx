'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Team {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdBy: string;
  createdAt: string;
}

interface TeamContextType {
  teams: Team[];
  currentTeam: Team | null;
  setCurrentTeam: (team: Team) => void;
  refreshTeams: () => Promise<void>;
  loading: boolean;
}

const TeamContext = createContext<TeamContextType>({
  teams: [],
  currentTeam: null,
  setCurrentTeam: () => {},
  refreshTeams: async () => {},
  loading: true,
});

export function useTeam() {
  return useContext(TeamContext);
}

export default function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeamState] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const didInitialCheck = useRef(false);
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);

  // Keep refs in sync without causing re-renders
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const refreshTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data);

        // Restore last selected team from localStorage or pick first
        const savedTeamId = localStorage.getItem('recgon_current_team');
        const saved = data.find((t: Team) => t.id === savedTeamId);
        if (saved) {
          setCurrentTeamState(saved);
        } else if (data.length > 0) {
          setCurrentTeamState(data[0]);
          localStorage.setItem('recgon_current_team', data[0].id);
        }

        // Only redirect to team setup on initial load, not on every refresh
        if (!didInitialCheck.current) {
          didInitialCheck.current = true;
          const currentPath = pathnameRef.current;
          const isSetupPage = currentPath === '/teams/setup' || currentPath.startsWith('/teams/invite/');
          if (data.length === 0 && !isSetupPage) {
            routerRef.current.push('/teams/setup');
          }
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch teams once on mount
  useEffect(() => {
    refreshTeams();
  }, [refreshTeams]);

  const setCurrentTeam = useCallback((team: Team) => {
    setCurrentTeamState(team);
    localStorage.setItem('recgon_current_team', team.id);
  }, []);

  return (
    <TeamContext.Provider value={{ teams, currentTeam, setCurrentTeam, refreshTeams, loading }}>
      {children}
    </TeamContext.Provider>
  );
}

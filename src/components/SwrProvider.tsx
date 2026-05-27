'use client';

import { SWRConfig } from 'swr';

// Global stale-while-revalidate cache for the whole authenticated app.
//
// Why this exists: every page used to fetch on mount with `cache: 'no-store'`
// and a local `loading` flag, so navigating between tabs (which remounts the
// page) re-fetched from scratch and flashed a skeleton every time. With one
// shared SWR cache mounted above the router children, returning to a tab reads
// the last-known data synchronously (no skeleton) and revalidates silently in
// the background.
//
// Cache keys embed `teamId` (and `projectId` where relevant), so switching
// teams reads that team's own slot — team A's data can never render under
// team B.
const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r)));

export default function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Collapse duplicate requests for the same key across remounts/focus —
        // the thundering-herd defense for slow LLM-backed endpoints.
        dedupingInterval: 5000,
        // Background-refresh on tab focus, but at most once per 10s so the slow
        // /api/overview isn't hammered. Replaces the hand-rolled focus /
        // visibilitychange listeners the pages used to register.
        revalidateOnFocus: true,
        focusThrottleInterval: 10000,
        revalidateOnReconnect: true,
        // Never show another team's data while a new team's first fetch is in
        // flight — show a skeleton once instead.
        keepPreviousData: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}

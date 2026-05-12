-- Phase 2 follow-up. Persist the most-recent GitHub-skill scan's diagnostic
-- block on the teammate_profiles row so:
--   1. The right-rail empty-state UI can render the diagnostic-aware
--      explanation after a page reload (otherwise scanDiagnostics is lost
--      until the next Re-scan).
--   2. Backend debugging can correlate empty-scan outcomes without log
--      scraping.
-- Shape mirrors the `ScanDiagnostics` TypeScript type in
-- `src/lib/recgon/githubSkills.ts`.

alter table teammate_profiles
  add column if not exists last_scan_diagnostics jsonb;

comment on column teammate_profiles.last_scan_diagnostics is
  'Latest GitHub-skill scan diagnostics (Phase 2). Mirrors the ScanDiagnostics TS type. Persisted by runScan so the UI can show the empty-state explanation after a page reload, and so backend debugging can correlate scan outcomes without log scraping.';

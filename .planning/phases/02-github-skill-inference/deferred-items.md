# Deferred items — Phase 02 (github-skill-inference)

Pre-existing issues observed during Plan 02-04 execution but OUT OF SCOPE for
this plan's `files_modified` list. Documented here so future cleanup work can
pick them up.

## Pre-existing lint errors (observed 2026-05-12 via `npm run lint`)

These exist on `main` independent of Plan 02-04's changes:

- `src/app/api/projects/[id]/analyze/route.ts:174:15` — `@typescript-eslint/no-unused-vars` rule definition not found (likely ESLint plugin config drift).
- `src/app/login/page.tsx:153:43` — `react/no-unescaped-entities` — unescaped apostrophe.
- `src/app/opengraph-image.tsx:137:12` — `react/jsx-no-comment-textnodes` — JSX comment outside braces.
- `src/app/opengraph-image.tsx:138:43` — `react/no-unescaped-entities` — unescaped apostrophe.

7 additional `@next/next/no-img-element` warnings in `app/projects/[id]/page.tsx`, `app/tasks/page.tsx`, `app/teams/page.tsx`, `app/verify/page.tsx`, `components/recgon/RecgonAdminPanel.tsx`, `components/v2/projects/FeaturedNeedsAttention.tsx`, `components/v2/projects/PortfolioRows.tsx` — non-blocking.

None of these files are in Plan 02-04's `files_modified` allow-list. Out of scope.

// Phase 2 / Plan 02-03. Behavior tests for the inferred-skills API routes
// covering the 412 / 429 / 200 / 404 branches that grep + build alone can't
// prove. Mirrors the vi.mock pattern from `profileMerge.test.ts` + the
// auth-gating analog from 02-PATTERNS.md "Auth on every team-scoped API route".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: vi.fn().mockResolvedValue('member'),
}));

vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  getInferredSkill: vi.fn(),
  getTeammateUserId: vi.fn(),
  getTeammateByTeamUser: vi.fn(),
  getMiningStatus: vi.fn(),
  rejectInferredSkill: vi.fn(),
  undoRejection: vi.fn(),
  markInferredSkillReviewed: vi.fn(),
  listInferredSkills: vi.fn(),
  markBannerReviewed: vi.fn(),
  clearMiningConsent: vi.fn(),
  setMiningConsent: vi.fn(),
}));

vi.mock('@/lib/llm/jobQueue', () => ({
  enqueueJob: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Import the mocked modules so we can assert against the fn instances.
import {
  getInferredSkill,
  getTeammateUserId,
  getTeammateByTeamUser,
  getMiningStatus,
  rejectInferredSkill,
} from '@/lib/recgon/inferredSkillsStorage';
import { enqueueJob } from '@/lib/llm/jobQueue';

// Routes under test — imported AFTER the mocks so the route's internal imports
// resolve to the stubs above.
import { POST as scanPOST } from '@/app/api/teams/[id]/inferred-skills/scan/route';
import { PATCH as skillPATCH } from '@/app/api/teams/[id]/inferred-skills/[skillId]/route';

const mockedGetMining = getMiningStatus as unknown as ReturnType<typeof vi.fn>;
const mockedGetTeammate = getTeammateByTeamUser as unknown as ReturnType<typeof vi.fn>;
const mockedEnqueueJob = enqueueJob as unknown as ReturnType<typeof vi.fn>;
const mockedGetInferredSkill = getInferredSkill as unknown as ReturnType<typeof vi.fn>;
const mockedGetTeammateUserId = getTeammateUserId as unknown as ReturnType<typeof vi.fn>;
const mockedRejectInferredSkill = rejectInferredSkill as unknown as ReturnType<typeof vi.fn>;

function makeScanReq(): NextRequest {
  return new NextRequest(
    'http://localhost/api/teams/team-1/inferred-skills/scan',
    { method: 'POST' },
  );
}

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest(
    'http://localhost/api/teams/team-1/inferred-skills/s-1',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

describe('POST /api/teams/[id]/inferred-skills/scan — 412 / 429 / 200', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Case 1: returns 412 when no githubMiningConsentAt', async () => {
    mockedGetMining.mockResolvedValue({
      githubMiningConsentAt: null,
      lastScanAt: null,
    });

    const res = await scanPOST(makeScanReq(), {
      params: Promise.resolve({ id: 'team-1' }),
    });

    expect(res.status).toBe(412);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('consent required');
    expect(mockedEnqueueJob).not.toHaveBeenCalled();
  });

  it('Case 2: returns 429 when last_scan_at is 30 minutes ago', async () => {
    mockedGetMining.mockResolvedValue({
      githubMiningConsentAt: '2026-05-12T00:00:00Z',
      lastScanAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });

    const res = await scanPOST(makeScanReq(), {
      params: Promise.resolve({ id: 'team-1' }),
    });

    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string; retryAfterMin: number };
    expect(json.error).toBe('rate_limited');
    expect(json.retryAfterMin).toBeGreaterThanOrEqual(25);
    expect(json.retryAfterMin).toBeLessThanOrEqual(35);
    expect(mockedEnqueueJob).not.toHaveBeenCalled();
  });

  it('Case 3: returns 200 + jobId when consent present and last_scan_at older than 1h', async () => {
    mockedGetMining.mockResolvedValue({
      githubMiningConsentAt: '2026-05-12T00:00:00Z',
      lastScanAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    mockedGetTeammate.mockResolvedValue({ id: 'tm-1' });
    mockedEnqueueJob.mockResolvedValue({ id: 'job-xyz' });

    const res = await scanPOST(makeScanReq(), {
      params: Promise.resolve({ id: 'team-1' }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; jobId: string };
    expect(json.ok).toBe(true);
    expect(json.jobId).toBe('job-xyz');
    expect(mockedEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockedEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'github_skill_inference',
        teamId: 'team-1',
        userId: 'user-1',
        payload: expect.objectContaining({ teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' }),
      }),
    );
  });
});

describe('PATCH /api/teams/[id]/inferred-skills/[skillId] — 404 cross-team IDOR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Case 4: returns 404 when the row belongs to a different team', async () => {
    mockedGetInferredSkill.mockResolvedValue({
      id: 's-1',
      teammateId: 'tm-1',
      teamId: 'team-OTHER',
      canonicalTag: 'frontend',
      score: 0.7,
      source: 'llm_commit',
      lastSeenAt: '2026-05-01T00:00:00Z',
      confirmedAt: null,
      rejectedAt: null,
      userReviewedAt: null,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    });

    const res = await skillPATCH(makePatchReq({ rejected: true }), {
      params: Promise.resolve({ id: 'team-1', skillId: 's-1' }),
    });

    expect(res.status).toBe(404);
    // IDOR check happens BEFORE rejectInferredSkill — so it must never run.
    expect(mockedRejectInferredSkill).not.toHaveBeenCalled();
    // We also never reach the second-stage user-id check.
    expect(mockedGetTeammateUserId).not.toHaveBeenCalled();
  });
});

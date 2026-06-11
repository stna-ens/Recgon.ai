// Password reset API — code verification, expiry, policy, and rate limiting.
//
// Mocks the storage/email/limiter seams so the route's decision logic runs
// exactly as in production, minus I/O.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock('@/lib/userStorage', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(async () => undefined),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'new-hash') },
}));

const verificationRow: { data: unknown; error: unknown } = { data: null, error: null };
const deleteCalls: string[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => verificationRow,
        }),
      }),
      delete: () => ({
        eq: async (_col: string, value: string) => {
          deleteCalls.push(`${table}:${value}`);
          return { error: null };
        },
      }),
    }),
  },
}));

import { POST } from '@/app/api/auth/reset-password/route';
import { isRateLimited } from '@/lib/rateLimit';
import { getUserByEmail, updateUser } from '@/lib/userStorage';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FUTURE = new Date(Date.now() + 5 * 60_000).toISOString();
const PAST = new Date(Date.now() - 5 * 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  verificationRow.data = null;
  verificationRow.error = null;
  deleteCalls.length = 0;
  vi.mocked(isRateLimited).mockResolvedValue(false);
});

describe('POST /api/auth/reset-password', () => {
  it('resets the password on a valid code', async () => {
    verificationRow.data = { code: '123456', expires_at: FUTURE };
    vi.mocked(getUserByEmail).mockResolvedValue({ id: 'u1', email: 'a@b.co' } as never);

    const res = await POST(makeRequest({ email: 'a@b.co', otp: '123456', password: 'longenough1' }));

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith('u1', { passwordHash: 'new-hash' });
    // Used code must be burned.
    expect(deleteCalls).toContain('email_verifications:a@b.co');
  });

  it('rejects a wrong code without touching the password', async () => {
    verificationRow.data = { code: '123456', expires_at: FUTURE };

    const res = await POST(makeRequest({ email: 'a@b.co', otp: '654321', password: 'longenough1' }));

    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects an expired code and deletes it', async () => {
    verificationRow.data = { code: '123456', expires_at: PAST };

    const res = await POST(makeRequest({ email: 'a@b.co', otp: '123456', password: 'longenough1' }));

    expect(res.status).toBe(400);
    expect(deleteCalls).toContain('email_verifications:a@b.co');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects passwords that violate policy with the policy code', async () => {
    verificationRow.data = { code: '123456', expires_at: FUTURE };

    const short = await POST(makeRequest({ email: 'a@b.co', otp: '123456', password: 'short' }));
    expect(short.status).toBe(400);
    expect((await short.json()).code).toBe('too_short');

    const uniform = await POST(makeRequest({ email: 'a@b.co', otp: '123456', password: 'aaaaaaaa' }));
    expect(uniform.status).toBe(400);
    expect((await uniform.json()).code).toBe('too_uniform');

    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(isRateLimited).mockResolvedValue(true);

    const res = await POST(makeRequest({ email: 'a@b.co', otp: '123456', password: 'longenough1' }));

    expect(res.status).toBe(429);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('does not reveal whether the account exists when the user is missing', async () => {
    verificationRow.data = { code: '123456', expires_at: FUTURE };
    vi.mocked(getUserByEmail).mockResolvedValue(undefined as never);

    const res = await POST(makeRequest({ email: 'ghost@b.co', otp: '123456', password: 'longenough1' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid or expired reset code');
  });
});

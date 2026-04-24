import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import {
  isWaitlistAdminEmail,
  listRegistrationWaitlistEntries,
  updateRegistrationWaitlistStatus,
} from '@/lib/waitlist';

const UpdateWaitlistSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
});

async function requireWaitlistAdmin(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email || !isWaitlistAdminEmail(email)) return null;
  return email;
}

export async function GET() {
  const adminEmail = await requireWaitlistAdmin();
  if (!adminEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const entries = await listRegistrationWaitlistEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load waitlist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminEmail = await requireWaitlistAdmin();
  if (!adminEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateWaitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid waitlist update' }, { status: 400 });
  }

  try {
    const entry = await updateRegistrationWaitlistStatus(
      parsed.data.id,
      parsed.data.status,
      adminEmail,
    );
    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update waitlist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

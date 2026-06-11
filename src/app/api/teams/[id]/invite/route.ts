import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { createInvitation, verifyTeamAccess, getTeam } from '@/lib/teamStorage';
import { sendTeamInviteEmail } from '@/lib/email';
import { serverError } from '@/lib/apiError';
import { logger } from '@/lib/logger';

const InviteSchema = z.object({
  role: z.enum(['member', 'viewer']).catch('member'),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const callerRole = await verifyTeamAccess(id, session.user.id);
  if (callerRole !== 'owner' && callerRole !== 'member') {
    return NextResponse.json({ error: 'Only owners and members can send invitations' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 });
  }
  const { role, email } = parsed.data;

  try {
    const invitation = await createInvitation(id, role, session.user.id, email);

    // Optional email delivery — the invite link works either way, so a Resend
    // hiccup must not fail the request. Emailed flag lets the UI word its toast.
    let emailed = false;
    if (email) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
      const inviterName =
        (session.user as { nickname?: string }).nickname || session.user.email || 'A teammate';
      const team = await getTeam(id);
      try {
        await sendTeamInviteEmail({
          to: email,
          teamName: team?.name ?? 'their team',
          inviterName,
          inviteUrl: `${baseUrl}/teams/invite/${invitation.token}`,
        });
        emailed = true;
      } catch (err) {
        logger.warn('team invite email failed', {
          to: email,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ ...invitation, emailed }, { status: 201 });
  } catch (error) {
    return serverError('POST /api/teams/[id]/invite', error);
  }
}

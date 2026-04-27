import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { runDispatch } from '@/lib/recgon/dispatcher';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const result = await runDispatch(teamId);
  return NextResponse.json({ result });
}

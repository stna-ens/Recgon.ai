import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTask,
  logEvent,
  setTaskVerification,
} from '@/lib/recgon/storage';

// Owner override — on any task, any kind, any time, the owner can mark done.
// No verification, no auto-rating: the owner's decision is final and we record
// `verified_by='owner_override'` so the audit trail makes the call explicit.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can override verification' }, { status: 403 });
  }

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: string };
    note = body?.note;
  } catch {
    /* empty body is fine */
  }

  await setTaskVerification(taskId, {
    verificationStatus: 'owner_override',
    verifiedAt: new Date().toISOString(),
    verifiedBy: 'owner_override',
    verificationEvidence: { verdict: note ?? 'Owner marked complete', iterations: 0 },
    status: 'completed',
  });

  await logEvent({
    teamId,
    teammateId: task.assignedTo,
    taskId,
    event: 'completed',
    payload: { by: session.user.id, override: true, note },
  });

  return NextResponse.json({ success: true });
}

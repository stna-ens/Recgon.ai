import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTask,
  getTeammate,
  setTaskProof,
  setTaskVerification,
} from '@/lib/recgon/storage';
import { logger } from '@/lib/logger';
import { ProofPayloadSchema } from '@/lib/schemas';
import { enqueueJob } from '@/lib/llm/jobQueue';
import type { ProofPayload } from '@/lib/recgon/types';

// Teammate-submitted proof for tasks Recgon couldn't auto-verify. The body is
// validated against ProofPayloadSchema, persisted, and a fresh
// task_verification job is enqueued in 'proof_evaluation' mode.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!task.assignedTo) return NextResponse.json({ error: 'Task not assigned' }, { status: 400 });
  if (task.verificationStatus !== 'proof_requested') {
    return NextResponse.json(
      { error: `Proof not requested for this task (verification status=${task.verificationStatus})` },
      { status: 400 },
    );
  }

  const teammate = await getTeammate(task.assignedTo);
  if (teammate?.userId && teammate.userId !== session.user.id && role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the assignee or team owner can submit proof' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = ProofPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const proof: ProofPayload = {
    ...parsed.data,
    submittedAt: new Date().toISOString(),
    submittedBy: session.user.id,
  };

  await setTaskProof(taskId, proof);
  await setTaskVerification(taskId, { verificationStatus: 'proof_evaluating' });

  try {
    await enqueueJob({
      teamId,
      userId: session.user.id,
      kind: 'task_verification',
      payload: { taskId, mode: 'proof_evaluation' },
    });
  } catch (err) {
    logger.warn('failed to enqueue proof evaluation', {
      taskId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to schedule proof evaluation' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

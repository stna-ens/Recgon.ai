import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, upsertRating, logEvent } from '@/lib/recgon/storage';
import { recordRatingForLearning } from '@/lib/recgon/learn';

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
  if (!task || task.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!task.assignedTo) {
    return NextResponse.json({ error: 'Task not assigned' }, { status: 400 });
  }

  const body = (await request.json()) as { rating?: number; note?: string };
  if (body.rating !== 1 && body.rating !== -1) {
    return NextResponse.json({ error: 'rating must be 1 or -1' }, { status: 400 });
  }

  const rating = await upsertRating({
    taskId,
    teammateId: task.assignedTo,
    rating: body.rating,
    note: body.note,
    ratedBy: session.user.id,
  });

  await logEvent({
    teamId,
    teammateId: task.assignedTo,
    taskId,
    event: 'rated',
    payload: { rating: rating.rating, note: rating.note },
  });

  // Update the teammate's fit_profile so future matching biases toward
  // their strengths. Failures are non-fatal — the rating is already saved.
  try {
    await recordRatingForLearning(task.assignedTo, task.kind, rating.rating);
  } catch {
    /* swallowed */
  }

  return NextResponse.json({ rating });
}

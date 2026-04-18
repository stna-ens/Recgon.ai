// Status polling endpoint for queued LLM jobs.
//
// Client polls this to follow a `{ status: 'queued', jobId }` response from
// an inline-first API route (e.g. /api/feedback/analyze). Returns the job's
// current status and — once succeeded — the result payload.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJob } from '@/lib/llm/jobQueue';
import { getUserTeams } from '@/lib/teamStorage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Access control: requester must be on the team the job belongs to.
  // Owner of the row also passes (covers anonymous enqueues in the future).
  if (job.user_id !== session.user.id) {
    const teams = await getUserTeams(session.user.id);
    if (!teams.some((t) => t.id === job.team_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  return NextResponse.json({
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    nextRetryAt: job.next_retry_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    error: job.error,
    result: job.status === 'succeeded' ? job.result : null,
  });
}

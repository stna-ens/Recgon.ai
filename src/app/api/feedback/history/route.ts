import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = getAllProjects(session.user.id);
  const history = projects.flatMap((p) =>
    (p.feedbackAnalyses ?? []).map((a) => ({
      ...a,
      projectId: p.id,
      projectName: p.name,
    }))
  );

  // Sort newest first
  history.sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());

  return NextResponse.json(history);
}

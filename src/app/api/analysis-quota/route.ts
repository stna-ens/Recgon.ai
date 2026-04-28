import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalysisQuota } from '@/lib/analysisQuota';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const quota = await getAnalysisQuota(session.user.id, session.user.email ?? undefined);
  return NextResponse.json(quota);
}

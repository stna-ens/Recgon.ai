import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createTeam, getUserTeams } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teams = await getUserTeams(session.user.id);
  return NextResponse.json(teams);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Team name must be at least 2 characters' }, { status: 400 });
    }

    const team = await createTeam(name.trim(), session.user.id);
    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    return serverError('POST /api/teams', error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createTeam, getUserTeams } from '@/lib/teamStorage';
import { getUserById } from '@/lib/userStorage';
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

  // Guard against stale JWTs where the user ID no longer exists in the DB.
  const userExists = await getUserById(session.user.id);
  if (!userExists) {
    return NextResponse.json(
      { error: 'Session expired. Please sign out and sign in again.' },
      { status: 401 },
    );
  }

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

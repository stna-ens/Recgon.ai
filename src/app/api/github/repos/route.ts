import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserById } from '@/lib/userStorage';

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  language: string | null;
  updated_at: string;
  stargazers_count: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = getUserById(session.user.id);
  if (!user?.githubAccessToken) {
    return NextResponse.json({ error: 'No GitHub account connected' }, { status: 400 });
  }

  const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
    headers: {
      Authorization: `Bearer ${user.githubAccessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch GitHub repos' }, { status: 502 });
  }

  const repos: GitHubRepo[] = await res.json();
  return NextResponse.json(repos);
}

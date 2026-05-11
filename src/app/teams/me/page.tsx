import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserTeams } from '@/lib/teamStorage';

export const dynamic = 'force-dynamic';

export default async function ProfileRedirectPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const teams = await getUserTeams(session.user.id);
  if (teams.length === 0) redirect('/teams/setup');

  redirect(`/teams/${teams[0].id}/me`);
}

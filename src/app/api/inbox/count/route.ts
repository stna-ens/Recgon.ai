import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';

// Lightweight count for the sidebar badge. Returns 0 quickly when not signed
// in or when the user has no teammate rows.
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ count: 0 });

  const { data: teammates } = await supabase
    .from('teammates')
    .select('id')
    .eq('user_id', session.user.id)
    .neq('status', 'retired');
  const ids = (teammates ?? []).map((t) => t.id);
  if (ids.length === 0) return NextResponse.json({ count: 0 });

  const { count } = await supabase
    .from('agent_tasks')
    .select('id', { count: 'exact', head: true })
    .in('assigned_to', ids)
    .in('status', ['assigned', 'accepted', 'in_progress']);

  return NextResponse.json({ count: count ?? 0 });
}

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// TEMPORARY — delete after screenshot session
export async function GET() {
  const { data } = await supabase.from('projects').select('id, name').limit(5);
  return NextResponse.json(data ?? []);
}

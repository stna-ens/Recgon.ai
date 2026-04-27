import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { logger } from '@/lib/logger';

const BUCKET = 'team-avatars';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(id, session.user.id);
  if (role !== 'owner') return NextResponse.json({ error: 'Only owners can change team avatar' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 });

  // Ensure bucket exists (safe to call if it already exists)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${id}/avatar.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (uploadError) {
    logger.error('team avatar upload failed', uploadError);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

  // Cache-bust: the storage path is deterministic (avatar.{ext} with upsert),
  // so without a version query the browser keeps serving the old image.
  const bustedUrl = `${publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await supabase
    .from('teams')
    .update({ avatar_url: bustedUrl })
    .eq('id', id);

  if (dbError) {
    logger.error('team avatar db update failed', dbError);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl: bustedUrl });
}

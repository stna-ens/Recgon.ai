import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateUser } from '@/lib/userStorage';
import { supabase } from '@/lib/supabase';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const BUCKET = 'avatars';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF are allowed' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 });
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${session.user.id}.${ext}`;

  // Upload to Supabase Storage (upsert to overwrite previous avatar)
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`; // cache-bust

  // Save to user record
  await updateUser(session.user.id, { avatarUrl });

  return NextResponse.json({ avatarUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Remove avatar from storage (try all extensions)
  for (const ext of ['jpg', 'png', 'webp', 'gif']) {
    await supabase.storage.from(BUCKET).remove([`${session.user.id}.${ext}`]);
  }

  // Clear avatar URL
  await updateUser(session.user.id, { avatarUrl: '' });

  return NextResponse.json({ success: true });
}

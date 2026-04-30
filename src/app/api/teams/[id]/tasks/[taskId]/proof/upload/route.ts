import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, getTeammate } from '@/lib/recgon/storage';
import { logger } from '@/lib/logger';

const BUCKET = 'proof-attachments';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_PREFIXES = ['image/', 'video/', 'application/pdf', 'text/'];
const ALLOWED_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/json',
]);

function typeAllowed(mime: string): boolean {
  if (!mime) return false;
  if (ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return ALLOWED_TYPES.has(mime);
}

// Upload one or more proof attachments for a task. Returns the attachment list
// the client should include in the next POST to .../proof.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!task.assignedTo) return NextResponse.json({ error: 'Task not assigned' }, { status: 400 });

  const teammate = await getTeammate(task.assignedTo);
  if (teammate?.userId && teammate.userId !== session.user.id && role !== 'owner') {
    return NextResponse.json({ error: 'Only the assignee or team owner can attach proof' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const files = formData.getAll('file').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 });

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const uploaded: Array<{ name: string; url: string }> = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name}: file exceeds 10 MB limit` }, { status: 400 });
    }
    if (!typeAllowed(file.type)) {
      return NextResponse.json({ error: `${file.name}: file type ${file.type || 'unknown'} not allowed` }, { status: 400 });
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
    const path = `${teamId}/${taskId}/${crypto.randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) {
      logger.error('proof upload failed', upErr);
      return NextResponse.json({ error: `Upload failed: ${file.name}` }, { status: 500 });
    }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    uploaded.push({ name: file.name, url: publicUrl });
  }

  return NextResponse.json({ attachments: uploaded });
}

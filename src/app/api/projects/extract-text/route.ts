import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const name = file.name.toLowerCase();

  try {
    if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ text: result.value });
    }

    if (name.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = (await import('pdf-parse') as any).default ?? (await import('pdf-parse'));
      const result = await pdfParse(buffer);
      return NextResponse.json({ text: result.text });
    }

    return NextResponse.json({ error: 'Unsupported file type. Use .pdf or .docx.' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract text';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

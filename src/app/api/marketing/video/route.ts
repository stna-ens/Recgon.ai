import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'node:fs';

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  
  if (!filePath || !filePath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // Security: only allow files from the temp directory
  if (!filePath.includes('pmai-videos')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="marketing-video.mp4"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to serve video' }, { status: 500 });
  }
}

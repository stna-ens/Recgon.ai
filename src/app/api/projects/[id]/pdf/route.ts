import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/storage';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import React, { type ReactElement } from 'react';
import { ProjectPdfDocument } from '@/lib/projectPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const project = await getProject(id, teamId);
  if (!project?.analysis) {
    return NextResponse.json({ error: 'No analysis found' }, { status: 404 });
  }

  // renderToBuffer expects a Document element. Our wrapper returns one — cast
  // through DocumentProps to satisfy the type without losing structure.
  const element = React.createElement(ProjectPdfDocument, {
    analysis: project.analysis,
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_strategy_brief.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
}

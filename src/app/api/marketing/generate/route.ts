import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProject, saveProject, generateId } from '@/lib/storage';
import { generateMarketingContent, Platform } from '@/lib/contentGenerator';
import { validateEnv } from '@/lib/env';
import { isRateLimited, GENERATE_LIMIT } from '@/lib/rateLimit';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (await isRateLimited(`generate:${ip}`, GENERATE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    validateEnv();
    const body = await request.json();
    const { projectId, platform, customPrompt, websiteUrl, teamId } = body as { projectId: string; platform: Platform; customPrompt?: string; websiteUrl?: string; teamId: string };

    if (!projectId || !platform) {
      return NextResponse.json({ error: 'projectId and platform are required' }, { status: 400 });
    }
    if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

    const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
    if (!hasWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const project = await getProject(projectId, teamId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.analysis) {
      return NextResponse.json({ error: 'Project has not been analyzed yet. Analyze it first.' }, { status: 400 });
    }

    const result = await generateMarketingContent(project.analysis, platform, customPrompt, websiteUrl);

    if (!project.marketingContent) project.marketingContent = [];
    project.marketingContent.push({
      id: generateId(),
      platform,
      content: result.content,
      generatedAt: new Date().toISOString(),
    });
    await saveProject(project);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Content generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

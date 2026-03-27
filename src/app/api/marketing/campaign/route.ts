import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProject, saveCampaignToProject, generateId } from '@/lib/storage';
import { generateCampaignPlan, CampaignType } from '@/lib/contentGenerator';
import { validateEnv } from '@/lib/env';
import { isRateLimited, GENERATE_LIMIT } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (isRateLimited(`campaign:${ip}`, GENERATE_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    validateEnv();
    const body = await request.json();
    const { projectId, campaignType, goal, duration } = body as {
      projectId: string;
      campaignType: CampaignType;
      goal: string;
      duration: string;
    };

    if (!projectId || !campaignType || !goal || !duration) {
      return NextResponse.json(
        { error: 'projectId, campaignType, goal, and duration are required' },
        { status: 400 },
      );
    }

    const project = getProject(projectId, session.user.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.analysis) {
      return NextResponse.json(
        { error: 'Project has not been analyzed yet. Analyze it first.' },
        { status: 400 },
      );
    }

    const plan = await generateCampaignPlan(project.analysis, campaignType, goal, duration);

    const campaign = {
      id: generateId(),
      type: campaignType,
      goal,
      duration,
      name: plan.campaignName,
      plan: plan as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };

    await saveCampaignToProject(projectId, campaign, session.user.id);

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('[campaign route error]', error);
    const message = error instanceof Error ? error.message : 'Campaign planning failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

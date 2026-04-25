import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { buildProjectAppContext } from '../lib/appContext';
import { geminiFunctionDeclarations, listTools } from '../lib/tools/registry';
import type { Project } from '../lib/storage';

const root = process.cwd();

describe('unified brain wiring', () => {
  it('registers every terminal tool needed by the app surfaces', () => {
    const names = listTools().map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([
      'analyze_code',
      'query_feedback',
      'collect_feedback',
      'generate_content',
      'generate_campaign',
      'fetch_analytics',
      'get_project_details',
      'list_projects',
    ]));
  });

  it('exports Gemini-safe function declarations for registered tools', () => {
    const declarations = geminiFunctionDeclarations();
    const names = declarations.map((declaration) => declaration.name);

    expect(names).toContain('generate_campaign');
    expect(names).toContain('collect_feedback');
    expect(JSON.stringify(declarations)).not.toContain('"$schema"');
    expect(JSON.stringify(declarations)).not.toContain('"additionalProperties"');
  });

  it('packs cross-surface project context for AI calls', () => {
    const project: Project = {
      id: 'project-1',
      teamId: 'team-1',
      createdBy: 'user-1',
      name: 'Recgon',
      sourceType: 'description',
      description: 'Founder workflow app',
      analyticsPropertyId: '123456789',
      socialProfiles: [{ platform: 'Twitter / X', url: 'https://x.com/recgon' }],
      createdAt: '2026-04-25T00:00:00.000Z',
      analysis: {
        name: 'Recgon',
        description: 'Turns product data into founder actions.',
        techStack: ['Next.js'],
        features: ['Project analysis', 'Feedback analysis'],
        targetAudience: 'Solo founders',
        uniqueSellingPoints: ['All product context in one place'],
        problemStatement: 'Founders lack connected context.',
        marketOpportunity: 'Early-stage founder tooling',
        competitors: [],
        businessModel: 'SaaS',
        revenueStreams: ['Subscriptions'],
        pricingSuggestion: '$19/mo',
        currentStage: 'mvp',
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        topRisks: ['Distribution risk'],
        prioritizedNextSteps: ['Talk to 10 founders'],
        gtmStrategy: 'Build in public',
        earlyAdopterChannels: ['Indie Hackers'],
        growthMetrics: ['Activation'],
        analyzedAt: '2026-04-25T00:00:00.000Z',
      },
      feedbackAnalyses: [{
        id: 'feedback-1',
        rawFeedback: ['Setup is confusing'],
        sentiment: 'mixed',
        summary: 'Users like the value but struggle with setup.',
        sentimentBreakdown: { positive: 40, neutral: 20, negative: 40 },
        themes: ['Setup clarity'],
        featureRequests: ['Show setup progress'],
        bugs: [],
        praises: ['Useful analysis'],
        developerPrompts: ['Add setup progress feedback.'],
        analyzedAt: '2026-04-25T00:00:00.000Z',
      }],
      marketingContent: [{
        id: 'content-1',
        platform: 'instagram',
        content: { caption: 'Founder context without guesswork' },
        generatedAt: '2026-04-25T00:00:00.000Z',
      }],
      campaigns: [{
        id: 'campaign-1',
        type: 'product-launch',
        goal: '100 beta users',
        duration: '1 month',
        name: 'Beta launch',
        plan: { summary: 'Launch through founder communities.' },
        createdAt: '2026-04-25T00:00:00.000Z',
      }],
    };

    const context = buildProjectAppContext(project);

    expect(context).toContain('Latest product analysis');
    expect(context).toContain('Recent feedback analyses');
    expect(context).toContain('Recent marketing content');
    expect(context).toContain('Recent campaigns');
    expect(context).toContain('GA4 connected');
  });

  it('keeps cross-surface project fetches fresh after terminal tool runs', () => {
    const files = [
      'src/components/TeamProvider.tsx',
      'src/app/mentor/page.tsx',
      'src/app/marketing/page.tsx',
      'src/app/feedback/page.tsx',
      'src/app/analytics/page.tsx',
      'src/app/page.tsx',
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).toContain("cache: 'no-store'");
    }
  });

  it('keeps overview surfaces user-scoped and refreshable', () => {
    const overviewRoutes = [
      'src/app/api/overview/route.ts',
      'src/app/api/overview/brief/route.ts',
      'src/app/api/overview/analytics/route.ts',
    ];

    for (const file of overviewRoutes) {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).toContain('getAllProjects(teamId, session.user.id)');
    }

    const overviewPage = readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
    expect(overviewPage).toContain("fetch(`/api/overview?teamId=${teamId}`, { cache: 'no-store' })");
    expect(overviewPage).toContain("fetch(`/api/overview/brief?teamId=${teamId}`, { cache: 'no-store' })");
    expect(overviewPage).toContain("fetch(`/api/overview/analytics?teamId=${teamId}`, { cache: 'no-store' })");
    expect(overviewPage).toContain("window.addEventListener('focus', loadOverview)");
  });

  it('uses text ids in analytics insight migration to match the existing schema', () => {
    const migration = readFileSync(path.join(root, 'supabase/migrations/20260425_analytics_insights.sql'), 'utf8');

    expect(migration).toContain('id text primary key');
    expect(migration).toContain('project_id text references projects(id)');
    expect(migration).toContain('team_id text not null references teams(id)');
    expect(migration).toContain('user_id text not null references users(id)');
  });

  it('keeps terminal project resolution scoped to the acting user', () => {
    const resolver = readFileSync(path.join(root, 'src/lib/tools/resolveProject.ts'), 'utf8');
    expect(resolver).toContain('getProject(trimmed, teamId, userId)');
    expect(resolver).toContain('getAllProjects(teamId, userId)');

    const listProjects = readFileSync(path.join(root, 'src/lib/tools/listProjects.ts'), 'utf8');
    expect(listProjects).toContain('getAllProjects(ctx.teamId, ctx.userId)');

    const toolFiles = [
      'src/lib/tools/analyzeCode.ts',
      'src/lib/tools/queryFeedback.ts',
      'src/lib/tools/collectFeedback.ts',
      'src/lib/tools/generateContent.ts',
      'src/lib/tools/generateCampaign.ts',
      'src/lib/tools/fetchAnalytics.ts',
      'src/lib/tools/getProjectDetails.ts',
    ];

    for (const file of toolFiles) {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).toContain('resolveProject(input.project, ctx.teamId, ctx.userId)');
      expect(source).not.toContain('resolveProject(input.project, ctx.teamId);');
    }
  });

  it('keeps MCP project access scoped to the authenticated user', () => {
    const route = readFileSync(path.join(root, 'src/app/api/mcp/route.ts'), 'utf8');
    expect(route).toContain('userId: tokenData.userId');
    expect(route).toContain('registerTools(server, access.teamIds, access.userId)');

    const mcpTools = readFileSync(path.join(root, 'src/lib/mcpTools.ts'), 'utf8');
    expect(mcpTools).toContain('getAllProjects(tid, userId)');
    expect(mcpTools).toContain('getProjectForTeams(projectId, teamIds, userId)');

    const storage = readFileSync(path.join(root, 'src/lib/storage.ts'), 'utf8');
    expect(storage).toContain('row.is_shared === false && row.created_by !== userId');
  });
});

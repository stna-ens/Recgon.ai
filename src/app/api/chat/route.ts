import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';
import { getGeminiClient, withRetry } from '@/lib/gemini';
import { mentorSystemPrompt, generateSuggestions } from '@/lib/prompts';
import { getHistory, saveMessages, clearHistory } from '@/lib/chatStorage';
import { getUserTeams } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';
import { validateEnv } from '@/lib/env';
import type { GenerationConfig } from '@google/generative-ai';

type GenerationConfigWithThinking = GenerationConfig & {
  thinkingConfig?: { thinkingBudget: number };
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  // Verify user is in this team
  const teams = await getUserTeams(session.user.id);
  if (!teams.some((t) => t.id === teamId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const projects = await getAllProjects(teamId);
  const history = await getHistory(session.user.id);
  const suggestions = generateSuggestions(projects);

  return NextResponse.json({ history, suggestions });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await clearHistory(session.user.id);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, history, teamId } = await request.json() as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
      teamId: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

    validateEnv();

    // Verify membership before loading team data
    const userTeams = await getUserTeams(session.user.id);
    if (!userTeams.some((t) => t.id === teamId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const projects = await getAllProjects(teamId);

    // Load stored history to give Recgon long-term memory across sessions
    const storedHistory = await getHistory(session.user.id);
    // Use up to last 30 stored messages as memory context (not the live session history)
    const memoryContext = storedHistory.slice(-30);

    const systemPrompt = mentorSystemPrompt(projects, memoryContext);

    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: systemPrompt,
    });

    const contents = [
      ...(history ?? []).map((msg) => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }],
      })),
      { role: 'user' as const, parts: [{ text: message }] },
    ];

    const result = await withRetry(() => model.generateContentStream({
      contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      } as GenerationConfigWithThinking,
    }));

    // Collect the full response to save it
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullResponse += text;
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();

        // Persist this exchange to long-term history
        const now = Date.now();
        await saveMessages(session.user.id, [
          { role: 'user', content: message, ts: now },
          { role: 'assistant', content: fullResponse, ts: now + 1 },
        ]);
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    return serverError('POST /api/chat', error);
  }
}

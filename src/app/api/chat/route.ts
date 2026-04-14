export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';
import { getGeminiClient, withRetry } from '@/lib/gemini';
import { mentorSystemPrompt, generateSuggestions, classifyChatProjectPrompt } from '@/lib/prompts';
import {
  getConversationMessages,
  saveMessages,
  createConversation,
  deleteConversation,
  verifyConversationOwner,
  deriveTitle,
  renameConversation,
  setConversationProject,
} from '@/lib/chatStorage';
import { getUserTeams } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';
import { validateEnv } from '@/lib/env';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const teams = await getUserTeams(session.user.id);
  if (!teams.some((t) => t.id === teamId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  const projects = await getAllProjects(teamId);
  const suggestions = generateSuggestions(projects);

  let history: Awaited<ReturnType<typeof getConversationMessages>> = [];
  if (conversationId) {
    const owns = await verifyConversationOwner(session.user.id, conversationId);
    if (!owns) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    history = await getConversationMessages(conversationId);
  }

  return NextResponse.json({ history, suggestions });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

  await deleteConversation(session.user.id, conversationId);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, history, teamId, conversationId: incomingConvId } = await request.json() as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
      teamId: string;
      conversationId?: string | null;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

    validateEnv();

    const userTeams = await getUserTeams(session.user.id);
    if (!userTeams.some((t) => t.id === teamId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const projects = await getAllProjects(teamId);

    // Resolve conversation: verify ownership, or create a new one
    let convId = incomingConvId ?? null;
    let createdNew = false;
    if (convId) {
      const owns = await verifyConversationOwner(session.user.id, convId);
      if (!owns) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    } else {
      const conv = await createConversation(session.user.id, deriveTitle(message));
      convId = conv.id;
      createdNew = true;
    }

    // Use last 30 messages from this conversation as memory context
    const storedHistory = await getConversationMessages(convId);
    const memoryContext = storedHistory.slice(-30);

    const systemPrompt = mentorSystemPrompt(projects, memoryContext);

    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
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
      },
    }));

    let fullResponse = '';
    const resolvedConvId = convId;
    const userId = session.user.id;

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

        const now = Date.now();
        await saveMessages(userId, resolvedConvId, [
          { role: 'user', content: message, ts: now },
          { role: 'assistant', content: fullResponse, ts: now + 1 },
        ]);

        // If we auto-created the conversation, refine the title and classify to a project
        if (createdNew) {
          await renameConversation(userId, resolvedConvId, deriveTitle(message));
          if (projects.length > 0) {
            try {
              const classifier = client.getGenerativeModel({
                model: 'gemini-2.5-flash',
                generationConfig: { responseMimeType: 'application/json', temperature: 0 },
              });
              const res = await classifier.generateContent(
                classifyChatProjectPrompt(
                  message,
                  projects.map((p) => ({ id: p.id, name: p.name, description: p.analysis?.description })),
                ),
              );
              const parsed = JSON.parse(res.response.text()) as { projectId?: string | null };
              const match = parsed.projectId && projects.some((p) => p.id === parsed.projectId)
                ? parsed.projectId
                : null;
              if (match) await setConversationProject(userId, resolvedConvId, match);
            } catch {
              // classifier is best-effort; silently skip
            }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-conversation-id': convId,
      },
    });
  } catch (error) {
    return serverError('POST /api/chat', error);
  }
}

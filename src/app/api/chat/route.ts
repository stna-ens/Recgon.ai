import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';
import { getGeminiClient } from '@/lib/openai';
import { mentorSystemPrompt, generateSuggestions } from '@/lib/prompts';
import { getHistory, saveMessages, clearHistory } from '@/lib/chatStorage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = getAllProjects(session.user.id);
  const history = getHistory(session.user.id);
  const suggestions = generateSuggestions(projects);

  return NextResponse.json({ history, suggestions });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  clearHistory(session.user.id);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, history } = await request.json() as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const projects = getAllProjects(session.user.id);

    // Load stored history to give Recgon long-term memory across sessions
    const storedHistory = getHistory(session.user.id);
    // Use up to last 30 stored messages as memory context (not the live session history)
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

    const result = await model.generateContentStream({
      contents,
      generationConfig: { temperature: 0.85, maxOutputTokens: 4096 },
    });

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
        saveMessages(session.user.id, [
          { role: 'user', content: message, ts: now },
          { role: 'assistant', content: fullResponse, ts: now + 1 },
        ]);
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

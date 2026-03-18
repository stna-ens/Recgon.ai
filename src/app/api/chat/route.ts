import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';
import { getGeminiClient } from '@/lib/openai';
import { mentorSystemPrompt } from '@/lib/prompts';

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
    const systemPrompt = mentorSystemPrompt(projects);

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
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) controller.enqueue(new TextEncoder().encode(text));
        }
        controller.close();
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

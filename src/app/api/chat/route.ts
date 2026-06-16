export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllProjects } from '@/lib/storage';
import { getGeminiClient, withRetry } from '@/lib/gemini';
import { mentorSystemPrompt, generateSuggestions, classifyChatProjectPrompt, localeDirective } from '@/lib/prompts';
import { getUserById } from '@/lib/userStorage';
import {
  getConversationMessages,
  saveMessages,
  createConversation,
  deleteConversation,
  verifyConversationOwner,
  deriveTitle,
  renameConversation,
  setConversationProject,
  getConversationProjectId,
} from '@/lib/chatStorage';
import { getUserTeams } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';
import { validateEnv } from '@/lib/env';
import { geminiFunctionDeclarations, isDestructiveTool } from '@/lib/tools/registry';
import { runTool } from '@/lib/tools/runTool';
import { getRecentActivities, formatActivitiesForPrompt } from '@/lib/activityLog';
import { logger } from '@/lib/logger';
import { PROMPT_VERSIONS } from '@/lib/llm/quality';
import type { Content } from '@google/generative-ai';

const MAX_TOOL_ITERATIONS = 7;

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
  const projects = await getAllProjects(teamId, session.user.id);
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
    const { message, history, teamId, conversationId: incomingConvId, projectId } = await request.json() as {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
      teamId: string;
      conversationId?: string | null;
      projectId?: string | null;
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

    const projects = await getAllProjects(teamId, session.user.id);

    const selectedProject = projectId ? projects.find((p) => p.id === projectId) ?? null : null;

    let convId = incomingConvId ?? null;
    let createdNew = false;
    if (convId) {
      const owns = await verifyConversationOwner(session.user.id, convId);
      if (!owns) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    } else {
      const conv = await createConversation(session.user.id, deriveTitle(message));
      convId = conv.id;
      createdNew = true;
      if (selectedProject) await setConversationProject(session.user.id, convId, selectedProject.id);
    }

    const storedHistory = await getConversationMessages(convId);
    const memoryContext = storedHistory.slice(-30);

    // Pull recent cross-surface activity so the terminal knows what the GUI did
    // (and vice versa). This is the thread that stitches the two surfaces together.
    const recentActivities = await getRecentActivities(teamId, { sinceHours: 48, limit: 15 });
    const activitiesBlock = recentActivities.length
      ? `\n\nRECENT ACTIVITY ACROSS THIS TEAM (both GUI and terminal, most recent first):\n${formatActivitiesForPrompt(recentActivities)}\n`
      : '';

    const toolGuidance = `\n\nAI OUTPUT QUALITY CONTRACT:
- Ground every answer in the project summaries, conversation history, recent activity, or tool results visible in this prompt.
- Do not fabricate metrics, campaigns, files, implementation status, revenue, user counts, or analytics. If the needed fact is missing, say what is missing or call the correct tool.
- Only call a tool when you need data NOT already in the system prompt: campaigns, marketing content, or live GA4 metrics.
- Do NOT call get_project_details just because someone asks a general question about their project. If the answer is in the project summary above, answer from it directly.
- Call tools for: running a new analysis, fetching live analytics, generating content, generating campaigns, or when the user explicitly asks to "show" or "fetch" something.
- If you call a tool, use the tool result as the source of truth and do not add unsupported details.
- If the user just wants advice or brainstorming, answer directly without any tool call.
- Before a final answer, check that every concrete claim is supported by known context or a tool result.
- The RECENT ACTIVITY block is historical context only. Do NOT treat a past tool failure shown there as the result of the tool call you just made. Trust the live tool result you receive in this turn.
- Never apologize for or explain a tool call that returned ok=true. If the result indicates an empty/missing state (no sources, no analyses, no GA4 property), simply state that fact.

TERMINAL CONTROL SURFACE:
- You can DO things, not just answer. Tools are namespaced by domain: project_*, task_*, teammate_*, team_*, member_*, invite_*, dispatch_*, account_*, plus analytics + marketing tools. Pick the single most specific tool for what the user asked.
- Refer to entities by the name the user gave (project/task/teammate/member). The tools resolve names fuzzily. If a tool returns an error like "matched multiple … be more specific", relay it and ask which one — do NOT guess.
- If a required argument is missing (e.g. who to assign a task to), ask ONE short question. Never invent assignees, dates, or IDs.
- CONFIRMATION (critical): some tools are destructive (project_delete, team_delete, member_remove, teammate_retire, invite_revoke, dispatch_run). If a tool result has needsConfirm=true, STOP — do not call anything else. Reply with ONE sentence asking the user to confirm, naming the exact target from the result's "message". Only after the user clearly agrees (e.g. "yes") do you re-call the SAME tool with confirm=true. Never set confirm=true on the first attempt.
- After a successful action, confirm what happened in 1-2 short lines. When a tool returns structured rows they are already shown to the user as cards — do not re-list every row; just give a one-line summary.`;

    const selectedProjectBlock = selectedProject
      ? `\n\nCURRENTLY SELECTED PROJECT FROM THE UI:\n- Name: ${selectedProject.name}\n- ID: ${selectedProject.id}\nWhen the user asks an ambiguous project question, answer for this project unless they clearly name another one.\n`
      : '';

    const user = await getUserById(session.user.id);
    const systemPrompt = mentorSystemPrompt(projects, memoryContext) + selectedProjectBlock + activitiesBlock + toolGuidance + localeDirective(user?.language);

    const client = getGeminiClient();
    const functionDeclarations = geminiFunctionDeclarations();

    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations }],
    });

    const contents: Content[] = [
      ...(history ?? []).map<Content>((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const encoder = new TextEncoder();
    const resolvedConvId = convId;
    const userId = session.user.id;

    // Anti-spoof for destructive confirmation: a `confirm: true` arg is only
    // honored if the PREVIOUS assistant message asked to confirm THAT tool.
    // The marker rides on chat history (saved below), so the gate survives the
    // two-request handshake ("delete X" → ask → "yes" → delete) statelessly.
    // The model cannot fabricate the marker — only this server writes it.
    // Parse from server-stored history (NOT the client-supplied `history`):
    // the marker is appended server-side after streaming and persisted, so it
    // only exists in the DB copy. The client never sees it and cannot forge it.
    const CONFIRM_MARKER = /<!--recgon:confirm:([a-z_]+)-->/g;
    const priorConfirmTools = new Set<string>();
    {
      const lastAssistant = [...storedHistory].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        for (const m of lastAssistant.content.matchAll(CONFIRM_MARKER)) priorConfirmTools.add(m[1]);
      }
    }
    const confirmRequestedFor = new Set<string>();

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (s: string) => controller.enqueue(encoder.encode(s));
        let fullResponse = '';

        // Cache identical tool calls within a single user turn. Gemini sometimes
        // re-issues the same call after seeing an empty/error result, hoping for
        // a different answer. Replaying the cached result short-circuits the loop
        // and forces the model to commit to a final answer.
        const toolCallCache = new Map<string, unknown>();
        const cacheKey = (name: string, args: unknown) => `${name}:${JSON.stringify(args ?? {})}`;

        // Tools that require a `project` argument. Gemini occasionally drops it.
        // When that happens, recover by extracting the project name the user
        // referred to in the current message, so we don't surface a confusing
        // "missing project" error to the user.
        const projectAwareTools = new Set([
          'get_project_details', 'analyze_code', 'fetch_analytics',
          'generate_content', 'generate_campaign',
        ]);
        const findProjectInMessage = (text: string): string | null => {
          const quoted = text.match(/"([^"]{1,80})"/);
          if (quoted) {
            const name = quoted[1];
            if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) return name;
          }
          for (const p of projects) {
            const re = new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (re.test(text)) return p.name;
          }
          return null;
        };
        const recoveredProject = findProjectInMessage(message);
        const patchArgs = (name: string, args: Record<string, unknown> | undefined) => {
          const a = { ...(args ?? {}) };
          if (projectAwareTools.has(name) && (!a.project || (typeof a.project === 'string' && !a.project.trim())) && recoveredProject) {
            a.project = recoveredProject;
          }
          return a;
        };

        try {
          let iterations = 0;
          let emptyTurns = 0;
          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations += 1;

            const result = await withRetry(() => model.generateContent({
              contents,
              generationConfig: { temperature: 0.85, maxOutputTokens: 4096 },
            }));

            const response = result.response;
            const calls = response.functionCalls() ?? [];
            logger.debug('mentor chat model turn', {
              iteration: iterations,
              calls: calls.map((c) => ({ name: c.name, args: c.args })),
              finishReason: response.candidates?.[0]?.finishReason,
              promptVersion: PROMPT_VERSIONS.mentor_chat,
              promptFeedback: response.promptFeedback,
            });

            if (calls.length > 0) {
              // Record the model's tool-call turn so it can reference it next iteration
              contents.push({
                role: 'model',
                parts: calls.map((c) => ({ functionCall: c })),
              });

              const responses = await Promise.all(calls.map(async (call) => {
                const patchedArgs = patchArgs(call.name, call.args as Record<string, unknown> | undefined);
                const key = cacheKey(call.name, patchedArgs);
                const cached = toolCallCache.get(key);
                if (cached !== undefined) {
                  // Don't re-run the side-effecting tool; tell the model it
                  // already called this and must produce a final answer.
                  return {
                    functionResponse: {
                      name: call.name,
                      response: {
                        ok: true,
                        output: cached,
                        note: 'You already called this tool with these arguments earlier in this turn. Do not call it again — produce the final answer using this result.',
                      } as Record<string, unknown>,
                    },
                  };
                }

                // Strip an unauthorized confirm=true so the destructive guard
                // re-asks instead of executing. Authorized only if the prior
                // assistant turn requested confirmation for THIS tool.
                if (
                  isDestructiveTool(call.name) &&
                  (patchedArgs as { confirm?: unknown }).confirm === true &&
                  !priorConfirmTools.has(call.name)
                ) {
                  (patchedArgs as { confirm?: boolean }).confirm = false;
                }

                const chip = `\n\n> running \`${call.name}\`...\n\n`;
                emit(chip);
                fullResponse += chip;

                const toolResult = await runTool(call.name, patchedArgs, {
                  userId,
                  teamId,
                  source: 'terminal',
                });

                // Render structured rows as cards immediately (deterministic —
                // the model can't garble the data). Parsed out by TerminalShell.
                if (toolResult.display && toolResult.display.items.length > 0) {
                  const block = `\n\`\`\`recgon:cards\n${JSON.stringify(toolResult.display)}\n\`\`\`\n`;
                  emit(block);
                  fullResponse += block;
                }

                let payload: Record<string, unknown>;
                if (toolResult.needsConfirm) {
                  confirmRequestedFor.add(call.name);
                  const msg = (toolResult.output as { message?: string })?.message ?? 'confirm this action';
                  payload = { ok: false, needsConfirm: true, message: msg };
                } else if (toolResult.ok) {
                  payload = { ok: true, output: toolResult.output };
                } else {
                  payload = { ok: false, error: toolResult.error };
                }

                // Don't cache a needsConfirm result — the user's "yes" must be
                // able to re-run the SAME call with confirm=true next turn.
                if (!toolResult.needsConfirm) {
                  toolCallCache.set(key, toolResult.ok ? toolResult.output : { error: toolResult.error });
                }

                return {
                  functionResponse: {
                    name: call.name,
                    response: payload,
                  },
                };
              }));

              contents.push({ role: 'user', parts: responses });
              continue; // next iteration — model now sees tool output
            }

            // No more tool calls — emit the final text.
            let text = '';
            try {
              text = response.text();
            } catch (e) {
              logger.error('chat: response.text() threw', e);
            }
            if (text) {
              emit(text);
              fullResponse += text;
              break;
            }

            // Empty turn: no tool call AND no text. Gemini does this
            // intermittently (often finishReason MALFORMED_FUNCTION_CALL),
            // especially on multi-step requests with a large tool surface.
            // It's non-deterministic, so simply re-sample a couple of times
            // before giving up — that recovers the vast majority of cases.
            // IMPORTANT: do NOT inject a nudge message into `contents` — the
            // model can fold that text into the next tool call's arguments
            // (e.g. assignee "grr8" + "Continue" → "grr8Continue").
            if (emptyTurns < 2 && iterations < MAX_TOOL_ITERATIONS) {
              emptyTurns += 1;
              logger.warn('chat: empty model turn, re-sampling', {
                emptyTurns,
                finishReason: response.candidates?.[0]?.finishReason,
              });
              continue;
            }

            const fallback = '\n\n_(could not complete that — try rephrasing, e.g. "create a task \'security review\' and assign it to Emir")_\n';
            emit(fallback);
            fullResponse += fallback;
            break;
          }

          if (iterations >= MAX_TOOL_ITERATIONS) {
            const msg = '\n\n_(reached tool-call limit — stopping here)_\n';
            emit(msg);
            fullResponse += msg;
          }
        } catch (err) {
          // Log the real error server-side; never stream raw exception text
          // (provider/internal details) into the user-visible transcript.
          logger.error('chat: stream failed', err);
          const msg = '\n\n_(something went wrong — try again)_\n';
          emit(msg);
          fullResponse += msg;
        } finally {
          controller.close();

          // Persist the (invisible) confirmation marker so the NEXT request can
          // authorize a confirm=true re-call for these destructive tools. Hidden
          // from the UI by TerminalShell. Appended after close() — never streamed.
          for (const toolName of confirmRequestedFor) {
            fullResponse += `\n<!--recgon:confirm:${toolName}-->`;
          }

          const now = Date.now();
          await saveMessages(userId, resolvedConvId, [
            { role: 'user', content: message, ts: now },
            { role: 'assistant', content: fullResponse, ts: now + 1 },
          ]);

          if (createdNew) {
            await renameConversation(userId, resolvedConvId, deriveTitle(message));
          }

          // Classify conversation to a project if not already tagged
          const currentProjectId = await getConversationProjectId(userId, resolvedConvId).catch(() => undefined);
          if (currentProjectId === null && selectedProject) {
            await setConversationProject(userId, resolvedConvId, selectedProject.id);
          } else if (currentProjectId === null && projects.length > 0) {
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
              const raw = res.response.text().trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
              const parsed = JSON.parse(raw) as { projectId?: string | null };
              const match = parsed.projectId && projects.some((p) => p.id === parsed.projectId)
                ? parsed.projectId
                : null;
              if (match) await setConversationProject(userId, resolvedConvId, match);
            } catch (err) {
              logger.error('chat: project classify failed', err);
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

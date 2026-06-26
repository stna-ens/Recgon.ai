import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import { createIssue, listIssues } from '@/lib/issueStorage';
import { convertIssueToTasks } from '@/lib/recgon/issueToTasks';
import { getProject } from '@/lib/storage';
import { getUserById } from '@/lib/userStorage';
import { logger } from '@/lib/logger';
import type { OutputLanguage } from '@/lib/prompts';

// GET — list every issue on the team (inbox view).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const issues = await listIssues(teamId);
  return NextResponse.json({ issues });
}

// POST — create an issue and convert it to tasks inline. The conversion is one
// Gemini Flash call (consistent with mintUserTask's inline skill-tagging) and is
// awaited so the client gets the real task count for the toast.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const canWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const body = (await request.json()) as { title?: string; description?: string; projectId?: string | null };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  // Optional project must belong to THIS team — never trust the client's id.
  let projectId: string | null = null;
  if (body.projectId) {
    const project = await getProject(body.projectId, teamId);
    if (!project) return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
    projectId = body.projectId;
  }

  // createdBy comes from the session — NEVER from the body (T-mkn-01).
  const issue = await createIssue(teamId, {
    title: body.title.trim(),
    description: body.description?.trim() || null,
    projectId,
    createdBy: session.user.id,
  });

  // Convert in the submitter's language so spawned task copy reads naturally.
  let language: OutputLanguage = 'en';
  try {
    language = ((await getUserById(session.user.id))?.language as OutputLanguage) ?? 'en';
  } catch {
    /* non-fatal — default to English */
  }

  let taskCount = 1;
  try {
    ({ taskCount } = await convertIssueToTasks(issue.id, { language }));
  } catch (err) {
    // convertIssueToTasks is itself fail-soft on the LLM, so a throw here is a
    // storage/mint failure. The issue row already exists; surface a soft error
    // but don't lose it.
    logger.error('POST /issues: conversion failed', {
      teamId,
      issueId: issue.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { issue, taskCount: 0, warning: 'Issue saved but task conversion failed; it will retry.' },
      { status: 200 },
    );
  }

  return NextResponse.json({ issue, taskCount });
}

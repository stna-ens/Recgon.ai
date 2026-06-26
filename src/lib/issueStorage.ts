// quick-260626-mkn — Issues inbox storage.
//
// Thin teamId-scoped CRUD over the `issues` table (supabase/migrations/
// 20260626_issues.sql), mirroring the snake_case ↔ camelCase mapper pattern in
// src/lib/recgon/storage.ts. An issue is a teammate-written request; Recgon
// converts it into 1-or-many tasks (source='issue') via the conversion engine
// in src/lib/recgon/issueToTasks.ts. `listTasksForIssue` reads the spawned
// tasks back off `agent_tasks` by their source_ref linkage — it reuses the
// canonical mapTask mapper from recgon/storage.ts, never reimplementing it.

import { supabase } from './supabase';
import { mapTask, type TaskRow } from './recgon/storage';
import type { AgentTask } from './recgon/types';

export type IssueStatus = 'open' | 'converting' | 'converted' | 'closed';

export type Issue = {
  id: string;
  teamId: string;
  projectId: string | null;
  title: string;
  description: string;
  status: IssueStatus;
  taskCount: number;
  createdBy: string | null;
  createdAt: string;
  convertedAt: string | null;
};

type IssueRow = {
  id: string;
  team_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: IssueStatus;
  task_count: number;
  created_by: string | null;
  created_at: string;
  converted_at: string | null;
};

function mapIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id ?? null,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    taskCount: Number(row.task_count ?? 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    convertedAt: row.converted_at,
  };
}

export async function createIssue(
  teamId: string,
  input: { title: string; description?: string | null; projectId?: string | null; createdBy?: string | null },
): Promise<Issue> {
  const { data, error } = await supabase
    .from('issues')
    .insert({
      team_id: teamId,
      project_id: input.projectId ?? null,
      title: input.title,
      description: input.description ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`createIssue failed: ${error?.message}`);
  return mapIssue(data as IssueRow);
}

export async function listIssues(teamId: string): Promise<Issue[]> {
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`listIssues failed: ${error.message}`);
  return (data ?? []).map((r) => mapIssue(r as IssueRow));
}

export async function getIssue(id: string): Promise<Issue | null> {
  const { data } = await supabase
    .from('issues')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data ? mapIssue(data as IssueRow) : null;
}

export async function updateIssueStatus(
  id: string,
  status: IssueStatus,
  taskCount?: number,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (taskCount !== undefined) update.task_count = taskCount;
  // Stamp the conversion time the moment an issue lands on 'converted'.
  if (status === 'converted') update.converted_at = new Date().toISOString();
  const { error } = await supabase.from('issues').update(update).eq('id', id);
  if (error) throw new Error(`updateIssueStatus failed: ${error.message}`);
}

export async function closeIssue(id: string): Promise<void> {
  const { error } = await supabase
    .from('issues')
    .update({ status: 'closed' })
    .eq('id', id);
  if (error) throw new Error(`closeIssue failed: ${error.message}`);
}

export async function deleteIssue(id: string): Promise<void> {
  const { error } = await supabase.from('issues').delete().eq('id', id);
  if (error) throw new Error(`deleteIssue failed: ${error.message}`);
}

// The spawned tasks for an issue, read back off agent_tasks by their stable
// source_ref linkage (source='issue' AND source_ref->>'issueId' = issueId).
// Reuses the canonical mapTaskRow mapper from recgon/storage.ts.
export async function listTasksForIssue(issueId: string): Promise<AgentTask[]> {
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('source', 'issue')
    .eq('source_ref->>issueId', issueId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listTasksForIssue failed: ${error.message}`);
  return (data ?? []).map((r) => mapTask(r as TaskRow));
}

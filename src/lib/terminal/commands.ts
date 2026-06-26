// Slash-command registry for the Terminal page.
//
// Free-text input is sent verbatim to /api/chat — Recgon's persona stays intact.
// Slash commands are converted to directive prompts that name the exact tool
// and required args, so the model doesn't drop into "which project?" follow-ups.
// A short terse-mode prefix is added so command output reads like a CLI result
// instead of conversational prose.

export type SlashArgHint = 'project' | 'entity' | 'free' | 'none';

export interface SlashCommand {
  name: string;
  description: string;
  argHint?: SlashArgHint;
  /** Build the directive sent to /api/chat. Omit for local-only commands. */
  buildPrompt?: (args: string) => string;
  /** Local commands (no API call): /help, /clear, /history. */
  isLocal?: boolean;
}

const directRun =
  'Call the tool exactly once and report the result. Do not ask follow-up questions.';
const tersePrefix =
  '[terminal mode] Respond tersely. Lead with the action result. Skip pleasantries. Use bullets and short lines for structured data.';
const projOrMain = (arg: string) =>
  arg ? `"${arg}"` : "the user's main project";

// Every task command shares one shape:
//  · no details typed  → ask ONE short question and wait (no tool call yet),
//  · details typed/replied → resolve the task fuzzily (match the user's wording
//    to an existing task even if it isn't word-for-word) and the teammate by
//    nickname, then act. Ambiguous/not-found → ask, never guess.
const taskFlow = (arg: string, ask: string, act: (a: string) => string) =>
  arg
    ? `${tersePrefix} ${act(arg)} Match the user's wording to an existing task even if it is approximate, and resolve any teammate by their nickname. If the task or teammate is ambiguous or not found, ask one short question instead of guessing. ${directRun}`
    : `${tersePrefix} ${ask} Ask it in one short line and wait for the reply — do NOT call any tool yet.`;

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/help',
    description: 'list every available command',
    argHint: 'none',
    isLocal: true,
  },
  {
    name: '/projects',
    description: 'list every project on this team',
    argHint: 'none',
    buildPrompt: () =>
      `${tersePrefix} Call list_projects once and summarize what comes back. ${directRun}`,
  },
  {
    name: '/analyze',
    description: '/analyze <project> — run codebase analysis',
    argHint: 'project',
    buildPrompt: (arg) =>
      `${tersePrefix} Call analyze_code with project=${projOrMain(arg)}. ${directRun}`,
  },
  {
    name: '/analytics',
    description: '/analytics <project> — fetch GA4 insights (last 30d)',
    argHint: 'project',
    buildPrompt: (arg) =>
      `${tersePrefix} Call fetch_analytics with project=${projOrMain(arg)} and days=30. The project argument is required — do not omit it. ${directRun}`,
  },
  // ── Tasks ──────────────────────────────────────────────────────────
  {
    name: '/tasks',
    description: '/tasks [status] — list tasks (e.g. /tasks unassigned, /tasks mine)',
    argHint: 'free',
    buildPrompt: (arg) =>
      `${tersePrefix} Call task_list to list tasks${arg ? ` matching "${arg}" (interpret it as a status filter, "mine", an assignee, or a project)` : ''}. ${directRun}`,
  },
  {
    name: '/task',
    description: '/task [describe it] — show one task in detail',
    argHint: 'entity',
    buildPrompt: (arg) =>
      taskFlow(
        arg,
        'The user wants to see a task but did not say which. Ask which task.',
        (a) => `Call task_get for the task the user describes: "${a}".`,
      ),
  },
  {
    name: '/assign',
    description: '/assign [task to teammate] — assign a task to someone',
    argHint: 'entity',
    buildPrompt: (arg) =>
      taskFlow(
        arg,
        'The user wants to assign a task. Ask which task, and to whom (teammate nickname).',
        (a) => `The user wants to assign a task: "${a}". Identify the task and the teammate, then call task_assign.`,
      ),
  },
  {
    name: '/reassign',
    description: '/reassign [task to teammate] — move a task (or to nobody to unassign)',
    argHint: 'entity',
    buildPrompt: (arg) =>
      taskFlow(
        arg,
        'The user wants to reassign a task. Ask which task, and to which teammate (or "nobody" to unassign).',
        (a) => `The user wants to reassign a task: "${a}". Call task_reassign (pass assignee=null to unassign).`,
      ),
  },
  {
    name: '/schedule',
    description: '/schedule [task for date] — set a task date',
    argHint: 'entity',
    buildPrompt: (arg) =>
      taskFlow(
        arg,
        'The user wants to schedule a task. Ask which task, and for what date.',
        (a) => `The user wants to schedule a task: "${a}". Call task_schedule with a YYYY-MM-DD scheduledDate.`,
      ),
  },
  {
    name: '/snooze',
    description: '/snooze [task for N days] — defer a task',
    argHint: 'entity',
    buildPrompt: (arg) =>
      taskFlow(
        arg,
        'The user wants to snooze a task. Ask which task, and for how many days.',
        (a) => `The user wants to snooze a task: "${a}". Call task_snooze with the task and number of days.`,
      ),
  },
  {
    name: '/complete',
    description: '/complete [task] — mark a task done',
    argHint: 'entity',
    buildPrompt: (arg) =>
      taskFlow(
        arg,
        'The user wants to mark a task done. Ask which task.',
        (a) => `Call task_set_status with action="complete" for the task the user describes: "${a}".`,
      ),
  },
  // ── Issues ─────────────────────────────────────────────────────────
  {
    name: '/issues',
    description: '/issues [status] — list filed issues (e.g. /issues open)',
    argHint: 'free',
    buildPrompt: (arg) =>
      `${tersePrefix} Call issue_list to list issues${arg ? ` with status="${arg}"` : ''}. ${directRun}`,
  },
  {
    name: '/issue',
    description: '/issue [describe it] — file an issue; Recgon splits it into tasks',
    argHint: 'free',
    buildPrompt: (arg) =>
      arg
        ? `${tersePrefix} The user is filing an issue: "${arg}". Call issue_create with a clear title (and description if the user gave detail). Report how many tasks Recgon spawned. ${directRun}`
        : `${tersePrefix} The user wants to file an issue but did not say what. Ask in one short line what needs doing, and wait — do NOT call any tool yet.`,
  },
  {
    name: '/inbox',
    description: 'show unassigned tasks needing attention',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call inbox_list once. ${directRun}`,
  },
  {
    name: '/calendar',
    description: 'show your scheduled tasks',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call calendar_list once. ${directRun}`,
  },
  {
    name: '/dispatch',
    description: 'run Recgon to auto-assign the backlog (asks to confirm)',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call dispatch_run. It is destructive, so follow the confirmation protocol. ${directRun}`,
  },
  // ── Teammates & team ───────────────────────────────────────────────
  {
    name: '/teammates',
    description: 'list teammates with capacity + skills',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call teammate_list once. ${directRun}`,
  },
  {
    name: '/teammate',
    description: '/teammate <name> — show one teammate',
    argHint: 'entity',
    buildPrompt: (arg) => `${tersePrefix} Call teammate_get for "${arg}". ${directRun}`,
  },
  {
    name: '/team',
    description: 'show the current team',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call team_get for the current team. ${directRun}`,
  },
  {
    name: '/members',
    description: 'list members of the current team',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call member_list once. ${directRun}`,
  },
  {
    name: '/invite',
    description: '/invite [email] — create an invite link',
    argHint: 'free',
    buildPrompt: (arg) =>
      `${tersePrefix} Call invite_create${arg ? ` with email="${arg}"` : ''}. ${directRun}`,
  },
  {
    name: '/account',
    description: 'show your account settings',
    argHint: 'none',
    buildPrompt: () => `${tersePrefix} Call account_get once. ${directRun}`,
  },
  {
    name: '/clear',
    description: 'delete the active conversation',
    argHint: 'none',
    isLocal: true,
  },
  {
    name: '/history',
    description: 'open the conversation drawer (also: ⌘P)',
    argHint: 'none',
    isLocal: true,
  },
];

export type ParsedCommand =
  | { kind: 'free'; raw: string; apiText: string }
  | {
      kind: 'slash';
      raw: string;
      command: SlashCommand;
      args: string;
      apiText: string;
    }
  | { kind: 'local'; raw: string; command: SlashCommand };

/**
 * Parse a raw user input into either:
 *  - a local slash command (e.g. /help, /clear) handled by the UI,
 *  - a remote slash command with an apiText directive ready to send,
 *  - or a free-text turn passed through verbatim.
 *
 * Unknown slashes (e.g. /foo) are treated as free text — the user clearly
 * typed something deliberate, so we send it as-is rather than silently
 * swallowing it.
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { kind: 'free', raw: trimmed, apiText: trimmed };
  }

  const [head, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(' ').trim();
  const command = SLASH_COMMANDS.find((c) => c.name === head);

  if (!command) {
    return { kind: 'free', raw: trimmed, apiText: trimmed };
  }

  if (command.isLocal || !command.buildPrompt) {
    return { kind: 'local', raw: trimmed, command };
  }

  return {
    kind: 'slash',
    raw: trimmed,
    command,
    args,
    apiText: command.buildPrompt(args),
  };
}

/** Filter the registry by a typed prefix like "/an" → /analyze, /analytics. */
export function filterCommands(token: string): SlashCommand[] {
  const q = token.toLowerCase();
  if (!q.startsWith('/')) return [];
  return SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(q));
}

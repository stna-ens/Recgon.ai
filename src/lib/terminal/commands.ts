// Slash-command registry for the Terminal page.
//
// Free-text input is sent verbatim to /api/chat — Recgon's persona stays intact.
// Slash commands are converted to directive prompts that name the exact tool
// and required args, so the model doesn't drop into "which project?" follow-ups.
// A short terse-mode prefix is added so command output reads like a CLI result
// instead of conversational prose.

export type SlashArgHint = 'project' | 'free' | 'none';

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
  {
    name: '/content',
    description: '/content <project> — generate Instagram marketing content',
    argHint: 'project',
    buildPrompt: (arg) =>
      `${tersePrefix} Call generate_content with project=${projOrMain(arg)} and platform="instagram". ${directRun}`,
  },
  {
    name: '/campaign',
    description: '/campaign <project> — draft a 1-month brand-awareness plan',
    argHint: 'project',
    buildPrompt: (arg) =>
      `${tersePrefix} Call generate_campaign with project=${projOrMain(arg)}, campaignType="brand-awareness", goal="build early awareness and grow signups", duration="1 month". ${directRun}`,
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

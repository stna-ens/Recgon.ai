// Roster proposer — one-shot LLM call that reads the team's projects and
// proposes a custom AI teammate roster tailored to what the team is building.
//
// Output is saved to `recgon_state.roster_proposal` so the UI can display it
// and the user can accept-all or pick a subset to materialise as `teammates`
// rows.

import { logger } from '../logger';
import { chatViaProviders } from '../llm/providers';
import { getAllProjects } from '../storage';
import { saveRosterProposal } from './storage';
import type { RosterProposal } from './types';

const SYSTEM_PROMPT = `You are Recgon — the dispatcher who staffs a team of AI specialists for a founder.

Given the team's projects, propose 3 to 5 AI teammates whose combined skills cover the work that needs doing. Avoid generic roles ("Marketing Lead") when a more specific one fits ("B2B Outbound Specialist", "Mobile UX Researcher"). Each teammate should have a clear lane the others don't overlap.

Respond with a single JSON object of the form:
{
  "reasoning": "<2-3 sentence summary of how you read the team's needs>",
  "teammates": [
    {
      "displayName": "<Full role title — what shows up on the card>",
      "title": "<Short one-line role label>",
      "skills": ["<lowercase tag>", "..."],
      "systemPrompt": "<2-4 sentence prompt describing identity, focus, output style>",
      "capacityHours": 168,
      "rationale": "<one sentence: why this teammate, given the team's projects>"
    }
  ]
}

Rules:
- 3 to 5 teammates max.
- Skills must be lowercase tags like 'b2b', 'mobile', 'figma', 'analytics', 'churn'. No spaces. Use existing tag conventions when possible.
- capacityHours = 168 (always-on AI default).
- Avoid duplicating skill profiles across teammates.
- Output ONLY the JSON object — no prose, no fences.`;

function buildProjectContext(projects: Awaited<ReturnType<typeof getAllProjects>>): string {
  if (projects.length === 0) {
    return 'No projects yet. Propose a generalist starter roster suitable for an early-stage product team.';
  }
  const lines: string[] = [];
  lines.push(`Team has ${projects.length} project(s):`);
  projects.slice(0, 5).forEach((p, i) => {
    lines.push(`\n${i + 1}. ${p.name}`);
    if (p.description) lines.push(`   ${p.description.slice(0, 240)}`);
    const a = p.analysis;
    if (a) {
      if (a.targetAudience) lines.push(`   Audience: ${a.targetAudience}`);
      if (a.businessModel) lines.push(`   Business model: ${a.businessModel}`);
      if (a.currentStage) lines.push(`   Stage: ${a.currentStage}`);
      if (a.prioritizedNextSteps?.length) {
        lines.push(`   Top next steps: ${a.prioritizedNextSteps.slice(0, 3).join(' / ')}`);
      }
    }
  });
  return lines.join('\n');
}

export type ProposeResult = {
  proposal: RosterProposal;
  rawSavedToState: boolean;
};

export async function proposeRoster(teamId: string): Promise<ProposeResult> {
  const projects = await getAllProjects(teamId);
  const userPrompt = buildProjectContext(projects);

  const raw = await chatViaProviders(SYSTEM_PROMPT, userPrompt, {
    taskKind: 'roster_proposal',
    promptVersion: 'v1',
    temperature: 0.6,
    maxTokens: 1800,
  });

  const proposal = parseProposal(raw);
  await saveRosterProposal(teamId, proposal);
  return { proposal, rawSavedToState: true };
}

/**
 * Strip common wrappings models add despite instructions:
 *   ```json … ```  ```ts … ```  plain ```fenced```  XML-ish wrapping
 * Also collapse leading/trailing whitespace.
 */
function stripWrappers(raw: string): string {
  let s = raw.trim();
  // Remove leading ```json / ``` and trailing ```
  s = s.replace(/^```(?:json|javascript|ts|typescript)?\s*\n?/i, '');
  s = s.replace(/\n?\s*```\s*$/i, '');
  return s.trim();
}

export function parseProposal(raw: string): RosterProposal {
  const cleaned = stripWrappers(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    // Tolerant: try to find the largest {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn('rosterProposer: could not parse model output', {
        preview: raw.slice(0, 300),
        len: raw.length,
      });
      return emptyProposal('Model output did not parse as JSON.');
    }
    try {
      obj = JSON.parse(match[0]);
    } catch (err) {
      logger.warn('rosterProposer: regex-extracted JSON still invalid', {
        preview: match[0].slice(0, 300),
        err: err instanceof Error ? err.message : String(err),
      });
      return emptyProposal('Model output did not parse as JSON.');
    }
  }

  const o = obj as Record<string, unknown>;
  const reasoning = typeof o.reasoning === 'string' ? o.reasoning : '';
  // Some models wrap the array in `roster` / `proposal` / nested object — try a few.
  let rawTeammates: Record<string, unknown>[] = [];
  if (Array.isArray(o.teammates)) {
    rawTeammates = o.teammates as Record<string, unknown>[];
  } else if (Array.isArray((o as { roster?: unknown }).roster)) {
    rawTeammates = (o as { roster: Record<string, unknown>[] }).roster;
  } else if (Array.isArray(o)) {
    rawTeammates = o as unknown as Record<string, unknown>[];
  } else {
    logger.warn('rosterProposer: parsed JSON had no teammates array', {
      keys: Object.keys(o).slice(0, 8),
      preview: cleaned.slice(0, 300),
    });
  }

  const teammates = rawTeammates
    .map((t) => ({
      displayName: typeof t.displayName === 'string' ? t.displayName.trim() : '',
      title: typeof t.title === 'string' ? t.title.trim() : '',
      skills: Array.isArray(t.skills)
        ? (t.skills as unknown[]).map(String).map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [],
      systemPrompt: typeof t.systemPrompt === 'string' ? t.systemPrompt.trim() : '',
      capacityHours: typeof t.capacityHours === 'number' && t.capacityHours > 0 ? t.capacityHours : 168,
      rationale: typeof t.rationale === 'string' ? t.rationale.trim() : '',
    }))
    .filter((t) => t.displayName && t.systemPrompt)
    .slice(0, 5);

  return {
    proposedAt: new Date().toISOString(),
    reasoning,
    teammates,
  };
}

function emptyProposal(reason: string): RosterProposal {
  return {
    proposedAt: new Date().toISOString(),
    reasoning: reason,
    teammates: [],
  };
}

// Exported for tests.
export const __testing = { buildProjectContext };

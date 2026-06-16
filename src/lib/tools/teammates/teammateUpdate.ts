import { z } from 'zod';
import { updateTeammate } from '../../recgon/storage';
import { resolveTeammate } from '../resolvers';
import type { ToolDefinition } from '../types';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const parameters = z.object({
  teammate: z.string().describe('Teammate name or UUID.'),
  displayName: z.string().optional().describe('New display name.'),
  title: z.string().optional().describe('New role/title.'),
  skills: z.array(z.string()).optional().describe('Replace the teammate\'s skills.'),
  capacityHours: z.number().positive().optional().describe('New weekly capacity in hours.'),
  workingDays: z.array(z.enum(WEEKDAYS)).optional().describe('Days the teammate works.'),
  status: z.enum(['active', 'paused']).optional().describe('Set active or paused (use teammate_retire to retire).'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; displayName: string; updated: string[]; }

export const teammateUpdateTool: ToolDefinition<Input, Output> = {
  name: 'teammate_update',
  description:
    "Update a teammate's name, title, skills, weekly capacity, working days, or pause/activate them. Use for \"give Alice 20h/week\", \"pause Bob\", \"add React to Alice's skills\".",
  parameters,
  summarize: (_input, output) => `Updated ${output.displayName} (${output.updated.join(', ') || 'no changes'})`,
  handler: async (input, ctx) => {
    const t = await resolveTeammate(input.teammate, ctx.teamId);
    const fields: Parameters<typeof updateTeammate>[1] = {};
    const updated: string[] = [];
    if (input.displayName !== undefined) { fields.displayName = input.displayName; updated.push('name'); }
    if (input.title !== undefined) { fields.title = input.title; updated.push('title'); }
    if (input.skills !== undefined) { fields.skills = input.skills; updated.push('skills'); }
    if (input.capacityHours !== undefined) { fields.capacityHours = input.capacityHours; updated.push('capacity'); }
    if (input.workingDays !== undefined) { fields.workingHours = { days: input.workingDays }; updated.push('working days'); }
    if (input.status !== undefined) { fields.status = input.status; updated.push(input.status); }
    await updateTeammate(t.id, fields);
    return { id: t.id, displayName: input.displayName ?? t.displayName, updated };
  },
};

import { z } from 'zod';
import { listTeammatesWithStats } from '../../recgon/storage';
import { teammatesToDisplay, type TeammateRow } from './teammateCard';
import type { ToolDefinition } from '../types';

const parameters = z.object({}).describe('No arguments — lists active teammates with capacity + rating stats.');
type Input = z.infer<typeof parameters>;

interface Output { count: number; teammates: TeammateRow[]; }

export const teammateListTool: ToolDefinition<Input, Output> = {
  name: 'teammate_list',
  description:
    'List the team\'s teammates with their skills, weekly capacity, in-flight load, and rating. Use when the user asks who is on the team, who is free, or who can do something.',
  parameters,
  summarize: (_input, output) => `${output.count} teammate(s)`,
  display: (_input, output) => teammatesToDisplay(output.teammates),
  handler: async (_input, ctx) => {
    const mates = await listTeammatesWithStats(ctx.teamId);
    return {
      count: mates.length,
      teammates: mates.map<TeammateRow>((m) => ({
        id: m.id,
        displayName: m.displayName,
        title: m.title ?? null,
        skills: m.skills,
        capacityHours: m.capacityHours,
        status: m.status,
        inFlightHours: m.inFlightHours ?? 0,
        stars: m.stars,
      })),
    };
  },
};

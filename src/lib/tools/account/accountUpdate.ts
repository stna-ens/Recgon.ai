import { z } from 'zod';
import { updateUser } from '../../userStorage';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  nickname: z.string().optional().describe('New display name.'),
  language: z.enum(['en', 'tr']).optional().describe('Preferred language (English or Turkish).'),
});

type Input = z.infer<typeof parameters>;
interface Output { updated: string[]; }

export const accountUpdateTool: ToolDefinition<Input, Output> = {
  name: 'account_update',
  description: 'Update the current user\'s display name or preferred language. Use for "change my name to X", "switch me to Turkish".',
  parameters,
  summarize: (_input, output) => `Updated account (${output.updated.join(', ') || 'no changes'})`,
  handler: async (input, ctx) => {
    const updated: string[] = [];
    const updates: { nickname?: string; language?: 'en' | 'tr' } = {};
    if (input.nickname !== undefined) { updates.nickname = input.nickname.trim(); updated.push('name'); }
    if (input.language !== undefined) { updates.language = input.language; updated.push('language'); }
    if (updated.length > 0) await updateUser(ctx.userId, updates);
    return { updated };
  },
};

import { z } from 'zod';
import { getAnalysisQuota } from '../../analysisQuota';
import { getUserById } from '../../userStorage';
import type { ToolDefinition } from '../types';

const parameters = z.object({}).describe('No arguments — returns the current user\'s analysis quota.');
type Input = z.infer<typeof parameters>;
interface Output { used: number; limit: number; allowed: boolean; nextAvailableAt: string | null; }

export const accountQuotaTool: ToolDefinition<Input, Output> = {
  name: 'account_quota',
  description: 'Show how many project analyses the user has left (lifetime cap + cooldown). Use for "how many analyses do I have left".',
  parameters,
  summarize: (_input, output) => `${output.used}/${output.limit} used`,
  handler: async (_input, ctx) => {
    const user = await getUserById(ctx.userId);
    const q = await getAnalysisQuota(ctx.userId, user?.email);
    return {
      used: q.used,
      limit: q.limit,
      allowed: q.allowed,
      nextAvailableAt: q.nextAvailableAt ?? null,
    };
  },
};

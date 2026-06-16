import { z } from 'zod';
import { getUserById } from '../../userStorage';
import type { ToolDefinition } from '../types';

const parameters = z.object({}).describe('No arguments — returns the current user\'s account profile.');
type Input = z.infer<typeof parameters>;
interface Output { id: string; email: string; nickname: string; language: string; githubConnected: boolean; }

export const accountGetTool: ToolDefinition<Input, Output> = {
  name: 'account_get',
  description: 'Show the current user\'s account: name, email, language, and whether GitHub is connected.',
  parameters,
  summarize: (_input, output) => `${output.nickname} <${output.email}>`,
  handler: async (_input, ctx) => {
    const user = await getUserById(ctx.userId);
    if (!user) throw new Error('User not found.');
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      language: user.language,
      githubConnected: Boolean(user.githubAccessToken),
    };
  },
};

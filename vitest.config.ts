import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/worktrees/**'],
    // jsdom globally so the Phase 2 UI specs in `.test.tsx` files can render
    // React components. The server/storage tests (`.test.ts`) don't touch the
    // DOM; adding window globals doesn't break them.
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

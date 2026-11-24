import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      '#lib': `${root}agent/lib`,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each indicator file runs its MCP scripts independently — vitest's worker
    // pool executes the files in parallel.
    fileParallelism: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: ['tests/helpers/env.ts'],
  },
});

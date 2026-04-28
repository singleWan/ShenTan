import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@shentan/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@shentan/core/schema': resolve(__dirname, 'packages/core/src/db/schema.ts'),
      '@shentan/core/queries': resolve(__dirname, 'packages/core/src/db/queries.ts'),
      '@shentan/agents': resolve(__dirname, 'packages/agents/src/index.ts'),
      '@shentan/crawler': resolve(__dirname, 'packages/crawler/src/index.ts'),
    },
  },
});

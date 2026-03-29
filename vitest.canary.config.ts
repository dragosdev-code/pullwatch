import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Isolated Vitest config for the canary parser tests.
 * Run with: npx vitest run --config vitest.canary.config.ts
 *
 * This config intentionally skips all src/** unit tests —
 * it only targets the canary/ directory.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@extension': path.resolve(__dirname, 'extension'),
      '@common': path.resolve(__dirname, 'extension/common'),
      '@background': path.resolve(__dirname, 'extension/background'),
    },
  },
  test: {
    include: ['canary/**/*.canary.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: 'forks',
    reporters: ['verbose'],
  },
});

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
    // Tier 2 shares one `Browser` across sequential chapters; parallel `it` blocks would
    // race on the same `Page` / context. `maxWorkers: 1` matches `describe.sequential` intent
    // for Vitest 4 (no deprecated poolOptions.singleFork).
    maxWorkers: 1,
    reporters: ['verbose'],
    // One retry filters out single-request flakes (e.g. brief GitHub 502)
    // without masking real DOM-change breakage. Higher values would delay
    // legitimate alerts by minutes, defeating the "early warning" goal.
    retry: 1,
  },
});

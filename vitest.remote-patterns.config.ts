import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Isolated Vitest config for the remote patterns.json smoke test.
 * Run with: npm run test:remote-patterns
 *
 * This config is deliberately separate from the main vite.config.ts so that
 * `npm test` stays offline. The smoke test hits the network to validate the
 * live hosted config — it should only run on-demand or in CI.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@extension': path.resolve(__dirname, 'extension'),
      '@common': path.resolve(__dirname, 'extension/common'),
    },
  },
  test: {
    globals: true,
    include: ['extension/common/__tests__/remote-patterns-smoke.test.ts'],
    testTimeout: 30_000,
    reporters: ['verbose'],
    // Retries are handled *inside* the test with transient-vs-permanent
    // awareness (5xx/timeout → retry, 4xx → fail immediately). Vitest-level
    // retry would re-run the entire suite indiscriminately.
    retry: 0,
  },
});

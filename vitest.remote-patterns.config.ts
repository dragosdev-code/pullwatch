import { defineConfig } from 'vitest/config';
import path from 'path';
import {
  REMOTE_PATTERNS_URL,
  REMOTE_PATTERNS_STAGING_URL,
} from './extension/common/constants';

/**
 * Isolated Vitest config for the remote patterns.json smoke test.
 * Deliberately separate from the main vite.config.ts so `npm test` stays
 * offline; this suite hits the network.
 *
 * **URLs** — Single source of truth: `extension/common/constants.ts`
 * (`REMOTE_PATTERNS_URL`, `REMOTE_PATTERNS_STAGING_URL`). This config picks
 * one via `--mode` (see npm scripts). If `process.env.REMOTE_PATTERNS_URL` is
 * already set (e.g. fork / custom raw file), that wins and mode is ignored.
 *
 * - `npm run test:remote-patterns` — production (`main`) patterns.json (default Vitest mode)
 * - `npm run test:remote-patterns:production` — same URL, explicit `--mode production` (alias for clarity)
 * - `npm run test:remote-patterns:staging` — `staging` branch patterns.json, `--mode staging`
 * - `npm run test:remote-patterns:production:parity` — production URL + Act 4 (bundled `DEFAULT_PATTERNS` parity)
 *
 * Act 4: **on** for staging by default; **off** for production unless `production:parity` or
 * `REMOTE_PATTERNS_COMPARE_DEFAULTS=true`. See `utils/remote-patterns-smoke-utils.ts`.
 */
function resolveRemotePatternsUrlForSmoke(mode: string): string {
  const fromEnv = process.env.REMOTE_PATTERNS_URL?.trim();
  if (fromEnv) return fromEnv;
  if (mode === 'staging') return REMOTE_PATTERNS_STAGING_URL;
  // production / main — default Vitest mode, `--mode production`, `--mode production-parity`, etc.
  return REMOTE_PATTERNS_URL;
}

export default defineConfig(({ mode }) => ({
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
    retry: 0,
    env: {
      REMOTE_PATTERNS_URL: resolveRemotePatternsUrlForSmoke(mode),
      ...(mode === 'production-parity'
        ? { REMOTE_PATTERNS_COMPARE_DEFAULTS: 'true' }
        : {}),
    },
  },
}));

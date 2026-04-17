/// <reference types="vitest/globals" />
/**
 * Remote patterns.json — schema smoke test.
 *
 * **Acts 1–3 (always):** fetch hosted JSON → Valibot schema → `compilePatterns`
 * (every `regex` compiles). Same checks the extension relies on.
 *
 * **Act 4 (conditional):** hosted `patterns` must deep-equal bundled
 * {@link DEFAULT_PATTERNS}. **Default:** staging URLs only; production opt-in via
 * `REMOTE_PATTERNS_COMPARE_DEFAULTS` or `npm run test:remote-patterns:production:parity`.
 * Full gating in `utils/remote-patterns-smoke-utils.ts`.
 *
 * ─── What this does NOT prove ───────────────────────────────────────
 * Regexes matching live GitHub HTML — that is the canary
 * (`canary/parser.canary.test.ts`).
 *
 * ─── URL override ───────────────────────────────────────────────────
 * `REMOTE_PATTERNS_URL` — staging, fork, or production raw file.
 * `REMOTE_PATTERNS_COMPARE_DEFAULTS` — force Act 4 on (`true`) or off (`false`)
 * when the URL heuristic is wrong (e.g. fork not named `staging`).
 *
 * See `vitest.remote-patterns.config.ts` for `--mode production`, `staging`,
 * `production-parity`, and env overrides.
 */

import { REMOTE_PATTERNS_URL } from '../constants';
import { validateRemoteConfig, type RemotePatternConfig } from '../pattern-registry-schema';
import { compilePatterns, DEFAULT_PATTERNS } from '../default-patterns';
import { fetchWithRetry } from './schema-test-helpers';
import {
  jsonComparable,
  shouldRunAct4DefaultsParity,
} from './utils/remote-patterns-smoke-utils';

const targetUrl = process.env.REMOTE_PATTERNS_URL || REMOTE_PATTERNS_URL;
const act4DefaultsParity = shouldRunAct4DefaultsParity(targetUrl);

// ── Shared state ────────────────────────────────────────────────────
// Each act builds on the previous one's output. Splitting into separate
// `it` blocks gives focused failure messages (HTTP error vs schema
// rejection vs regex SyntaxError) instead of one opaque crash.

let fetchedJson: unknown;
let validatedConfig: RemotePatternConfig;

// =====================================================================
// The remote config journey: fetch → validate → compile → [parity]
// =====================================================================

describe('Remote patterns.json smoke test', () => {
  beforeAll(() => {
    console.log(`Target URL: ${targetUrl}`);
    console.log(
      `[remote-patterns-smoke] Act 4 (DEFAULT_PATTERNS parity): ${act4DefaultsParity ? 'on' : 'off'}`,
    );
  });

  // ── Act 1: Can we reach the hosted file? ──────────────────────────
  // The fetch helper retries transient failures (5xx, timeouts) with
  // exponential backoff but fails immediately on permanent 4xx errors.

  it('fetches and parses the hosted patterns.json', async () => {
    const response = await fetchWithRetry(targetUrl);

    try {
      fetchedJson = await response.json();
    } catch (error) {
      throw new Error(
        `HTTP 200 but body is not valid JSON: ${error instanceof Error ? error.message : error}`,
      );
    }

    expect(fetchedJson).toBeDefined();
    expect(typeof fetchedJson).toBe('object');
  });

  // ── Act 2: Does the JSON match the extension's schema? ────────────
  // validateRemoteConfig runs the same Valibot schema the extension
  // uses at runtime (PatternRegistryService.doFetchRemote). A failure
  // here prints dotted paths to the invalid fields so you know exactly
  // what to fix in patterns.json.

  it('passes validateRemoteConfig (Valibot schema)', () => {
    expect(fetchedJson).toBeDefined();

    const result = validateRemoteConfig(fetchedJson);

    if (!result.success) {
      throw new Error(
        `Schema validation failed (dotted paths to invalid fields):\n  ${result.message}`,
      );
    }

    validatedConfig = result.data;
    expect(result.success).toBe(true);
  });

  // ── Act 3: Do all regex strings compile? ──────────────────────────
  // compilePatterns calls `new RegExp(entry.regex, entry.flags)` on
  // every pattern in the registry. A malformed regex source (e.g.
  // "[unclosed") throws SyntaxError even though the JSON shape is
  // valid — this is the second line of defense after the schema.

  it('compiles every regex pattern without SyntaxError', () => {
    expect(validatedConfig).toBeDefined();

    try {
      const compiled = compilePatterns(validatedConfig.patterns);
      expect(compiled).toBeDefined();
    } catch (error) {
      throw new Error(
        `Regex compilation failed — structure is valid but a regex string is broken:\n  ${error instanceof Error ? error.message : error}`,
      );
    }
  });

  // ── Act 4: Hosted patterns must match bundled defaults (when parity is on) ─
  // JSON round-trip normalizes key order so the diff is about content,
  // not serialization. Mismatch means someone updated default-patterns.ts
  // or patterns.json without syncing the other — fix before merging.
  // Default: staging only; production parity opt-in — see utils/remote-patterns-smoke-utils.ts.

  it.skipIf(!act4DefaultsParity)(
    'hosted patterns match DEFAULT_PATTERNS from default-patterns.ts',
    () => {
      expect(validatedConfig).toBeDefined();
      const hosted = jsonComparable(validatedConfig.patterns);
      const bundled = jsonComparable(DEFAULT_PATTERNS);
      expect(hosted).toEqual(bundled);
    },
  );
});

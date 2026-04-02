/// <reference types="vitest/globals" />
/**
 * Remote patterns.json — schema smoke test.
 *
 * Organized as a short story: fetch the live config, prove its structure
 * is valid, then prove every regex inside it compiles. Three acts, one
 * question each: "Can we reach it?", "Is the shape correct?", "Do the
 * regexes survive new RegExp()?"
 *
 * ─── What this proves ───────────────────────────────────────────────
 * The hosted JSON is structurally accepted by the extension: correct
 * types, required keys, valid unions, non-empty arrays, capture-group
 * indices >= 1, and syntactically valid RegExp source strings.
 *
 * ─── What this does NOT prove ───────────────────────────────────────
 * Whether those regexes actually *match* live GitHub HTML. That is the
 * canary's job (canary/parser.canary.test.ts). The two suites are
 * complementary — this smoke test proves the config won't be *rejected*
 * by the extension; the canary proves it *works*.
 *
 * ─── URL override ───────────────────────────────────────────────────
 * Set REMOTE_PATTERNS_URL env var to validate a staging / fork URL
 * instead of production. See DOM_CHANGE_RUNBOOK.md § 7.5 for details.
 */

import { REMOTE_PATTERNS_URL } from '../constants';
import { validateRemoteConfig, type RemotePatternConfig } from '../pattern-registry-schema';
import { compilePatterns } from '../default-patterns';
import { fetchWithRetry } from './schema-test-helpers';

// ── Resolve which URL to hit ────────────────────────────────────────
// Environment variable wins so CI and local overrides work without
// touching shipped extension code.
const targetUrl = process.env.REMOTE_PATTERNS_URL || REMOTE_PATTERNS_URL;

// ── Shared state ────────────────────────────────────────────────────
// Each act builds on the previous one's output. Splitting into
// separate `it` blocks gives focused failure messages (HTTP error vs
// schema rejection vs regex SyntaxError) instead of one opaque crash.

let fetchedJson: unknown;
let validatedConfig: RemotePatternConfig;

// =====================================================================
// The remote config journey: fetch → validate → compile
// =====================================================================

describe('Remote patterns.json smoke test', () => {
  beforeAll(() => {
    console.log(`Target URL: ${targetUrl}`);
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
});

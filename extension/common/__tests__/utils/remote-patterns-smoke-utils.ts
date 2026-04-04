/**
 * Helpers for `remote-patterns-smoke.test.ts`.
 *
 * Act 4 (DEFAULT_PATTERNS parity) gating lives here so the smoke test file
 * stays narrative-only (fetch → validate → compile → optional equality).
 */

import { REMOTE_PATTERNS_STAGING_URL } from '../../constants';

// ── Act 4 gate: why staging and not production ───────────────────────
//
// Staging exists to preview the exact config we intend to merge. Act 4
// enforces: hosted `patterns` === `DEFAULT_PATTERNS` in this repo — no silent
// drift between `pr-live-config` and `extension/common/default-patterns.ts`.
//
// Production (`main`) often legitimately runs *ahead* of the last published
// extension (remote hotfix after a GitHub DOM change). Requiring parity there
// would fail CI until every hotfix is accompanied by a store release. Acts
// 1–3 still guarantee production JSON is valid and every regex compiles.

/** `REMOTE_PATTERNS_COMPARE_DEFAULTS`: explicit on/off; `undefined` = use URL rules below. */
export function parseCompareDefaultsEnv(): boolean | undefined {
  const raw = process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(lower)) return false;
  if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
  return undefined;
}

/** `raw.githubusercontent.com/{owner}/{repo}/staging/.../patterns.json` (fork-friendly). */
export function isRawGitHubStagingPatternsPath(urlString: string): boolean {
  try {
    const { hostname, pathname } = new URL(urlString);
    if (hostname !== 'raw.githubusercontent.com') return false;
    const segments = pathname.split('/').filter(Boolean);
    return segments[2] === 'staging' && pathname.endsWith('/patterns.json');
  } catch {
    return false;
  }
}

/** Whether Act 4 should compare hosted `patterns` to bundled `DEFAULT_PATTERNS`. */
export function shouldRunAct4DefaultsParity(url: string): boolean {
  const override = parseCompareDefaultsEnv();
  if (override !== undefined) return override;

  return url === REMOTE_PATTERNS_STAGING_URL || isRawGitHubStagingPatternsPath(url);
}

/** JSON round-trip so key order does not affect deep equality. */
export function jsonComparable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

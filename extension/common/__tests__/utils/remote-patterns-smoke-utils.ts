/**
 * Helpers for `remote-patterns-smoke.test.ts`.
 *
 * Act 4 (DEFAULT_PATTERNS parity) gating lives here so the smoke test file
 * stays narrative-only (fetch → validate → compile → optional equality).
 */

import { REMOTE_PATTERNS_STAGING_URL } from '../../constants';

// ── Act 4 gate: staging by default; production opt-in ─────────────────
//
// Act 4 enforces: hosted `patterns` === `DEFAULT_PATTERNS` in this repo —
// no silent drift between `pr-live-config` and `extension/common/default-patterns.ts`.
//
// **Default:** Parity runs for **staging** only (canonical URL + fork-style
// `.../staging/.../patterns.json`). **Production** runs Acts 1–3 (fetch,
// schema, compile every regex) but **skips** Act 4 so `main` can hotfix ahead
// of the last store build without failing CI.
//
// **Opt-in production parity:** `REMOTE_PATTERNS_COMPARE_DEFAULTS=true` (e.g.
// `npm run test:remote-patterns:production:parity`) or any explicit env `true`.
// **Force parity off** (e.g. staging URL but skip Act 4): env `false`.

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

/** `raw.githubusercontent.com/{owner}/{repo}/main/.../patterns.json` (fork-friendly). */
export function isRawGitHubMainPatternsPath(urlString: string): boolean {
  try {
    const { hostname, pathname } = new URL(urlString);
    if (hostname !== 'raw.githubusercontent.com') return false;
    const segments = pathname.split('/').filter(Boolean);
    return segments[2] === 'main' && pathname.endsWith('/patterns.json');
  } catch {
    return false;
  }
}

/** Whether Act 4 should compare hosted `patterns` to bundled `DEFAULT_PATTERNS`. */
export function shouldRunAct4DefaultsParity(url: string): boolean {
  const override = parseCompareDefaultsEnv();
  if (override !== undefined) return override;

  if (url === REMOTE_PATTERNS_STAGING_URL || isRawGitHubStagingPatternsPath(url)) {
    return true;
  }

  // Production / main URLs: Acts 1–3 only unless REMOTE_PATTERNS_COMPARE_DEFAULTS=true.
  return false;
}

/** JSON round-trip so key order does not affect deep equality. */
export function jsonComparable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

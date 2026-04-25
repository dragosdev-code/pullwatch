/**
 * Canary test configuration — environment, targets, and HTTP identity.
 *
 * Centralizes every "what" and "where" the canary suite needs so the test
 * files themselves only contain orchestration logic. Env-var diagnostics
 * run at import time (module side-effect) to appear at the top of every
 * CI log, making it obvious which tier will execute before any test starts.
 */

import { GITHUB_BASE_URL } from '@common/constants';
import { toPullsSearchUrl } from '@common/github-url-utils';

// Re-export for call sites that only import canary config (same string as production).
export { GITHUB_BASE_URL };

// ── GitHub coordinates ───────────────────────────────────────────────────

/**
 * Separate `storageState` paths per bot so CI cache and local runs never mix cookies
 * between accounts. GitHub’s pulls UI depends on account feature flags — sharing one
 * file would make Chapter 2 see Chapter 1’s session and invalidate the test signal.
 */
export const STATE_FILE_LEGACY = 'playwright-state-legacy.json';

/** Same rationale as legacy: new-experience bot must not inherit the other account’s cookies. */
export const STATE_FILE_NEW = 'playwright-state-new.json';

// ── Typed env loader (Tier 2 credentials + Gmail) ───────────────────────

/** All three must be set for Gmail OTP device verification in Playwright login. */
export interface CanaryGmailSecrets {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

type CanaryEnvBase = {
  gmail: CanaryGmailSecrets | null;
  /** Non-fatal issues (e.g. half-set env vars that look like mistakes). */
  warnings: string[];
};

/**
 * Discriminated union for canary credentials. Use `mode` to branch; each variant
 * carries only the fields that are valid for that configuration — avoids “half-set”
 * secrets silently behaving like “skip tier 2” with no explanation.
 */
export type CanaryEnv =
  | (CanaryEnvBase & { mode: 'public-only' })
  | (CanaryEnvBase & { mode: 'legacy-only'; legacyUsername: string; password: string })
  | (CanaryEnvBase & { mode: 'new-only'; newUsername: string; password: string })
  | (CanaryEnvBase & {
      mode: 'full';
      legacyUsername: string;
      newUsername: string;
      password: string;
    });

function parseGmailSecrets(): { gmail: CanaryGmailSecrets | null; partial: boolean } {
  const clientId = (process.env.GMAIL_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET ?? '').trim();
  const refreshToken = (process.env.GMAIL_REFRESH_TOKEN ?? '').trim();
  const parts = [clientId, clientSecret, refreshToken].filter((s) => s.length > 0);
  if (parts.length === 3) {
    return { gmail: { clientId, clientSecret, refreshToken }, partial: false };
  }
  return { gmail: null, partial: parts.length > 0 };
}

/**
 * Reads process env once and returns a tagged union describing which Tier 2 chapters
 * can run. Emits {@link CanaryEnv.warnings} when env looks mis-set (e.g. username without password).
 */
export function loadCanaryEnv(): CanaryEnv {
  const warnings: string[] = [];

  const legacyUser = (process.env.GH_CANARY_USERNAME_LEGACY ?? '').trim();
  const newUser = (process.env.GH_CANARY_USERNAME_NEW ?? '').trim();
  const password = (process.env.GH_CANARY_PASSWORD ?? '').trim();

  const { gmail, partial: gmailPartial } = parseGmailSecrets();
  if (gmailPartial) {
    warnings.push(
      'Gmail OTP: GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN partially set — all three required; device verification bypass DISABLED'
    );
  }

  const legacyUserPresent = legacyUser.length > 0;
  const newUserPresent = newUser.length > 0;
  const passwordPresent = password.length > 0;

  if (legacyUserPresent && !passwordPresent) {
    warnings.push(
      'GH_CANARY_USERNAME_LEGACY is set but GH_CANARY_PASSWORD is empty — Chapter 1 will not run (password required).'
    );
  }
  if (newUserPresent && !passwordPresent) {
    warnings.push(
      'GH_CANARY_USERNAME_NEW is set but GH_CANARY_PASSWORD is empty — Chapter 2 will not run (password required).'
    );
  }
  if (passwordPresent && !legacyUserPresent && !newUserPresent) {
    warnings.push(
      'GH_CANARY_PASSWORD is set but neither GH_CANARY_USERNAME_LEGACY nor GH_CANARY_USERNAME_NEW is set — Tier 2 skipped.'
    );
  }

  const hasLegacyPair = legacyUserPresent && passwordPresent;
  const hasNewPair = newUserPresent && passwordPresent;

  const base = (): CanaryEnvBase => ({ gmail, warnings });

  if (!hasLegacyPair && !hasNewPair) {
    return { ...base(), mode: 'public-only' };
  }
  if (hasLegacyPair && !hasNewPair) {
    return {
      ...base(),
      mode: 'legacy-only',
      legacyUsername: legacyUser,
      password,
    };
  }
  if (!hasLegacyPair && hasNewPair) {
    return {
      ...base(),
      mode: 'new-only',
      newUsername: newUser,
      password,
    };
  }
  return {
    ...base(),
    mode: 'full',
    legacyUsername: legacyUser,
    newUsername: newUser,
    password,
  };
}

/** Singleton env snapshot for the test process (read once at module load). */
export const canaryEnv: CanaryEnv = loadCanaryEnv();

/** When false, Chapter 1 is skipped — no usable legacy bot configuration. */
export const HAS_LEGACY_CREDENTIALS =
  canaryEnv.mode === 'legacy-only' || canaryEnv.mode === 'full';

/** When false, Chapter 2 is skipped — no usable new-dashboard bot configuration. */
export const HAS_NEW_CREDENTIALS = canaryEnv.mode === 'new-only' || canaryEnv.mode === 'full';

/**
 * Parent Tier 2 describe runs only if at least one chapter can authenticate.
 * Why: avoid launching Chromium when both usernames are missing (faster, clearer logs).
 */
export const HAS_ANY_AUTH_CREDENTIALS = canaryEnv.mode !== 'public-only';

export const HAS_GMAIL_SECRETS = canaryEnv.gmail !== null;

/** Empty string when that chapter’s bot is not configured. */
export const CANARY_LEGACY_USERNAME =
  canaryEnv.mode === 'legacy-only' || canaryEnv.mode === 'full' ? canaryEnv.legacyUsername : '';

/** Empty string when that chapter’s bot is not configured. */
export const CANARY_NEW_USERNAME =
  canaryEnv.mode === 'new-only' || canaryEnv.mode === 'full' ? canaryEnv.newUsername : '';

/** Shared password; empty when Tier 2 cannot run. */
export const CANARY_PASSWORD =
  canaryEnv.mode === 'public-only' ? '' : canaryEnv.password;

// ── HTTP identity ────────────────────────────────────────────────────────
// GitHub aggressively blocks non-browser User-Agents with 429s or CAPTCHAs.
// We mimic a real Chrome session so Tier 1 fetch() requests succeed reliably.

export const REALISTIC_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': REALISTIC_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

// ── Canary targets ───────────────────────────────────────────────────────

export interface CanaryTarget {
  label: string;
  url: string;
  /**
   * When true, the test hard-fails if the parser returns zero PRs.
   * Set to false for queries that may legitimately be empty (e.g.
   * review-requested:@me when the bot has no pending reviews).
   */
  requireResults: boolean;
  /**
   * Chapter 2 only: when true and the page looks like the new dashboard, we hard-require
   * a non-null result from `GitHubEmbeddedJsonPullHarvest` before accepting HTML fallback.
   * Why: merged `@me` is a high-signal target (usually non-empty); proving the SSR blob
   * path works there catches envelope drift without flaking on legitimately empty queries.
   */
  requireEmbeddedJson?: boolean;
}

export const PUBLIC_TARGETS: CanaryTarget[] = [
  {
    label: 'Public: Open PRs (facebook/react)',
    url: `${GITHUB_BASE_URL}/facebook/react/pulls`,
    requireResults: true,
  },
  {
    label: 'Public: Open PRs (microsoft/vscode)',
    url: `${GITHUB_BASE_URL}/microsoft/vscode/pulls`,
    requireResults: true,
  },
];

/**
 * Chapter 1 — URLs shaped like the legacy global pulls list (`/pulls?q=…`).
 * Why: production’s legacy route uses `GitHubHTMLParser` only; the canary must exercise
 * that same document shape for users who are not on the new dashboard.
 */
export const AUTH_TARGETS: CanaryTarget[] = [
  {
    label: 'Auth: Assigned PRs (review-requested:@me)',
    url: `${GITHUB_BASE_URL}/pulls?q=is%3Aopen+is%3Apr+user-review-requested%3A%40me+`,
    requireResults: false,
  },
  {
    label: 'Auth: Merged PRs (author:@me)',
    url: `${GITHUB_BASE_URL}/pulls?q=is%3Apr+is%3Amerged+author%3A%40me`,
    requireResults: true,
  },
];

/**
 * Chapter 2 — same filters as {@link AUTH_TARGETS} but `/pulls/search?q=…`.
 * `requireEmbeddedJson` is enabled only where `requireResults` is true so we assert SSR JSON
 * on the merged list (expected data) and not on assigned reviews (often empty for the bot).
 */
export const AUTH_TARGETS_SEARCH: CanaryTarget[] = AUTH_TARGETS.map((t) => ({
  ...t,
  label: t.label.replace(/^Auth:/, 'Auth (search):'),
  url: toPullsSearchUrl(t.url),
  requireEmbeddedJson: t.requireResults ? true : t.requireEmbeddedJson,
}));

// ── Env-var diagnostics (side-effect at import time) ─────────────────────

const ch1 = HAS_LEGACY_CREDENTIALS ? 'RUN' : 'SKIP';
const ch2 = HAS_NEW_CREDENTIALS ? 'RUN' : 'SKIP';
const tier2 = HAS_ANY_AUTH_CREDENTIALS ? 'RUN (browser if any chapter)' : 'SKIP';

console.log(`\n[env] canaryEnv.mode: ${canaryEnv.mode}`);
if (canaryEnv.warnings.length > 0) {
  for (const w of canaryEnv.warnings) {
    console.warn(`[env] ⚠ ${w}`);
  }
}
console.log(`[env] GH_CANARY_USERNAME_LEGACY present: ${CANARY_LEGACY_USERNAME.length > 0}`);
console.log(`[env] GH_CANARY_USERNAME_NEW present: ${CANARY_NEW_USERNAME.length > 0}`);
console.log(`[env] GH_CANARY_PASSWORD present: ${CANARY_PASSWORD.length > 0}`);
console.log(`[env] Chapter 1 (legacy): ${ch1} | Chapter 2 (new): ${ch2}`);
console.log(`[env] Tier 2 parent: ${tier2}`);
console.log(`[env] GMAIL secrets present: ${HAS_GMAIL_SECRETS} → Device verification bypass ${HAS_GMAIL_SECRETS ? 'ENABLED' : 'DISABLED'}\n`);

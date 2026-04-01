/**
 * Canary test configuration — environment, targets, and HTTP identity.
 *
 * Centralizes every "what" and "where" the canary suite needs so the test
 * files themselves only contain orchestration logic. Env-var diagnostics
 * run at import time (module side-effect) to appear at the top of every
 * CI log, making it obvious which tier will execute before any test starts.
 */

// ── GitHub coordinates ───────────────────────────────────────────────────

export const GITHUB_BASE = 'https://github.com';

/** Persisted Playwright cookies/localStorage so subsequent runs skip login. */
export const STATE_FILE = 'playwright-state.json';

// ── Canary bot credentials (Tier 2 only) ─────────────────────────────────

export const CANARY_USERNAME = process.env.GH_CANARY_USERNAME ?? '';
export const CANARY_PASSWORD = process.env.GH_CANARY_PASSWORD ?? '';

/** When false, the entire Tier 2 describe block is skipped via vitest's skipIf. */
export const HAS_CREDENTIALS = CANARY_USERNAME.length > 0 && CANARY_PASSWORD.length > 0;

export const HAS_GMAIL_SECRETS =
  (process.env.GMAIL_CLIENT_ID ?? '').length > 0 &&
  (process.env.GMAIL_CLIENT_SECRET ?? '').length > 0 &&
  (process.env.GMAIL_REFRESH_TOKEN ?? '').length > 0;

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
}

export const PUBLIC_TARGETS: CanaryTarget[] = [
  {
    label: 'Public: Open PRs (facebook/react)',
    url: `${GITHUB_BASE}/facebook/react/pulls`,
    requireResults: true,
  },
  {
    label: 'Public: Open PRs (microsoft/vscode)',
    url: `${GITHUB_BASE}/microsoft/vscode/pulls`,
    requireResults: true,
  },
];

export const AUTH_TARGETS: CanaryTarget[] = [
  {
    label: 'Auth: Assigned PRs (review-requested:@me)',
    url: `${GITHUB_BASE}/pulls?q=is%3Aopen+is%3Apr+user-review-requested%3A%40me+`,
    requireResults: false,
  },
  {
    label: 'Auth: Merged PRs (author:@me)',
    url: `${GITHUB_BASE}/pulls?q=is%3Apr+is%3Amerged+author%3A%40me`,
    requireResults: true,
  },
];

// ── Env-var diagnostics (side-effect at import time) ─────────────────────
// Printed once at the very top of CI output so operators can immediately
// tell which tiers will run without scrolling through test results.

console.log(`\n[env] GH_CANARY_USERNAME present: ${CANARY_USERNAME.length > 0}`);
console.log(`[env] GH_CANARY_PASSWORD present: ${CANARY_PASSWORD.length > 0}`);
console.log(`[env] HAS_CREDENTIALS: ${HAS_CREDENTIALS} → Tier 2 will ${HAS_CREDENTIALS ? 'RUN' : 'SKIP'}`);
console.log(`[env] GMAIL secrets present: ${HAS_GMAIL_SECRETS} → Device verification bypass ${HAS_GMAIL_SECRETS ? 'ENABLED' : 'DISABLED'}\n`);

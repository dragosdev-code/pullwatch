/**
 * Parser Canary Tests — Hourly synthetic monitor.
 *
 * Validates parsers against live GitHub so DOM and SSR changes surface before
 * users hit them.
 *
 * **Runbook:** [canary/DOM_CHANGE_RUNBOOK.md](DOM_CHANGE_RUNBOOK.md)
 *
 * - **Tier 1** — [Step 2+](DOM_CHANGE_RUNBOOK.md#step-2--identify-which-pattern-broke) (public baseline, legacy parser).
 * - **Chapter 1** — legacy `/pulls?q=…` — same remediation as Tier 1 for classic patterns.
 * - **Chapter 2** — `/pulls/search` — [embedded JSON / HTML fallback](DOM_CHANGE_RUNBOOK.md#step-2--identify-which-pattern-broke),
 *   markers `CANARY_EMBEDDED_JSON_DRIFT` / `CANARY_NEW_HTML_FALLBACK_DEGRADED`.
 *
 * Environment variables (Tier 2):
 *   GH_CANARY_USERNAME_LEGACY, GH_CANARY_USERNAME_NEW — separate bots
 *   GH_CANARY_PASSWORD — shared password for both
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN — device OTP bypass
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import {
  PUBLIC_TARGETS,
  AUTH_TARGETS,
  AUTH_TARGETS_SEARCH,
  HAS_ANY_AUTH_CREDENTIALS,
  HAS_LEGACY_CREDENTIALS,
  HAS_NEW_CREDENTIALS,
  CANARY_LEGACY_USERNAME,
  CANARY_NEW_USERNAME,
  CANARY_PASSWORD,
  STATE_FILE_LEGACY,
  STATE_FILE_NEW,
  BROWSER_HEADERS,
} from './utils/config';
import { parseAndAssert, parseSearchRouteAndAssert } from './utils/parse-orchestrator';
import { observeNewExperienceSearchObservability } from './utils/dual-probe';
import { checkAvatarCoverage } from './utils/assertions';
import { GitHubSession } from './utils/github-session';

// 5xx and Cloudflare edge errors (520-530) that GitHub's CDN can return.
// These are infrastructure issues, not content/DOM problems.
const TRANSIENT_STATUS_CODES = new Set([
  429, 500, 502, 503, 504,
  520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530,
]);

function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUS_CODES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries on transient HTTP errors so a brief GitHub blip doesn't trigger
 * a false-positive Discord alert about a DOM change. The canary runs hourly,
 * so a single failed run has outsized impact on alert fatigue — retrying
 * 2x with 5s gaps absorbs most short-lived 502/503 incidents.
 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 2,
  delayMs = 5_000,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, { headers, redirect: 'follow' });
    if (resp.ok) return resp;
    if (isTransientStatus(resp.status) && attempt < retries) {
      console.warn(
        `  [fetch] HTTP ${resp.status} — retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})`,
      );
      await sleep(delayMs);
      continue;
    }
    return resp;
  }
  throw new Error('fetchWithRetry: unreachable');
}

// ═════════════════════════════════════════════════════════════════════════
// Tier 1: Public Baseline (always runs, no auth)
// ═════════════════════════════════════════════════════════════════════════

describe('Canary: GitHub PR parser against live DOM', () => {
  describe('Tier 1 — Public baseline (no auth required)', () => {
    describe.each(PUBLIC_TARGETS)('$label', (target) => {
      it('fetches with browser-like headers, parses ≥1 PR when required, and validates structure', async () => {
        console.log(`\n── Tier 1: ${target.label} ──`);
        console.log(`  [fetch] GET ${target.url}`);

        const resp = await fetchWithRetry(target.url, BROWSER_HEADERS);
        const html = await resp.text();

        console.log(`  [fetch] HTTP ${resp.status} — ${html.length} bytes received`);
        expect(resp.status, `[${target.label}] HTTP status`).toBe(200);

        const prs = await parseAndAssert(html, target);
        checkAvatarCoverage(prs, target.label, 3);

        console.log(`── Tier 1: ${target.label} — PASSED ──\n`);
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Tier 2: Authenticated journeys — shared browser, one context per chapter
  // ═════════════════════════════════════════════════════════════════════════

  describe.skipIf(!HAS_ANY_AUTH_CREDENTIALS)('Tier 2 — Authenticated PR journeys', () => {
    let browser: Browser;

    beforeAll(async () => {
      console.log('\n── Tier 2: Launching shared Chromium for legacy + new chapters ──');
      browser = await chromium.launch({ headless: true });
    });

    afterAll(async () => {
      await browser?.close();
      console.log('── Tier 2: Shared browser closed ──\n');
    });

    /**
     * Run chapters in order: legacy account must finish (and release its context)
     * before the new-experience account logs in — avoids cookie bleed and matches
     * the Playwright multi-context pattern.
     */
    describe.sequential('Chapters (legacy then new experience)', () => {
      // ── Chapter 1: The Legacy Path ─────────────────────────────────────
      // Why: production’s legacy route uses GitHubHTMLParser only; background fetch
      // does not run JS, so /pulls?q= must still yield classic scrapable HTML.

      describe.skipIf(!HAS_LEGACY_CREDENTIALS)('Chapter 1 — Legacy /pulls path', () => {
        let session!: GitHubSession;

        beforeAll(async () => {
          session = new GitHubSession({
            username: CANARY_LEGACY_USERNAME,
            password: CANARY_PASSWORD,
            stateFile: STATE_FILE_LEGACY,
            browser,
            usernameEnvHint: 'GH_CANARY_USERNAME_LEGACY',
          });
          await session.launch();
        });

        describe.each(AUTH_TARGETS)('$label', (target) => {
          it('parses the authenticated page and validates PR contract (incl. soft avatar check)', async () => {
            console.log(`\n── Chapter 1: ${target.label} ──`);

            if (!session.isLoggedIn) {
              console.warn(
                `  ⊘ Skipping "${target.label}" — login did not succeed (see beforeAll logs above)`,
              );
              return;
            }

            const html = await session.getPageHTML(target.url);
            const prs = await parseAndAssert(html, target);
            checkAvatarCoverage(prs, target.label, 2);

            console.log(`── Chapter 1: ${target.label} — PASSED ──\n`);
          });
        });

        afterAll(async () => {
          await session.close();
        });
      });

      // ── Chapter 2: The New Experience ───────────────────────────────────
      // Why: new dashboard prefers /pulls/search + embedded SSR JSON; JSON is tried
      // first in the waterfall because it is more stable than hashed CSS modules.
      // Observability splits CRITICAL JSON drift vs WARN-only HTML fallback drift.

      describe.skipIf(!HAS_NEW_CREDENTIALS)('Chapter 2 — New /pulls/search experience', () => {
        let session!: GitHubSession;

        beforeAll(async () => {
          session = new GitHubSession({
            username: CANARY_NEW_USERNAME,
            password: CANARY_PASSWORD,
            stateFile: STATE_FILE_NEW,
            browser,
            usernameEnvHint: 'GH_CANARY_USERNAME_NEW',
          });
          await session.launch();
        });

        describe.each(AUTH_TARGETS_SEARCH)('$label', (target) => {
          it(
            'embedded SSR JSON path, HTML fallback observability, and search-route parse — see Runbook Step 2 / markers',
            async () => {
              console.log(`\n── Chapter 2: ${target.label} ──`);

              if (!session.isLoggedIn) {
                console.warn(
                  `  ⊘ Skipping "${target.label}" — login did not succeed (see beforeAll logs above)`,
                );
                return;
              }

              const html = await session.getPageHTML(target.url);
              // Observability first: emits CANARY_* markers and throws on critical JSON drift
              // before we assert parse success — keeps Discord/workflow logic aligned with logs.
              observeNewExperienceSearchObservability(html, target.label);
              const prs = await parseSearchRouteAndAssert(html, target);
              checkAvatarCoverage(prs, target.label, 2);

              console.log(`── Chapter 2: ${target.label} — PASSED ──\n`);
            },
          );
        });

        afterAll(async () => {
          await session.close();
        });
      });
    });
  });
});

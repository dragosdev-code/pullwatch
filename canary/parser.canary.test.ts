/**
 * Parser Canary Tests — Hourly synthetic monitor.
 *
 * Validates the extension's HTML parser against live GitHub pages so we
 * catch DOM-change regressions before users do. Structured in two tiers:
 *
 *   Tier 1 (Public Baseline)  — always runs, no auth needed.
 *   Tier 2 (Authenticated)    — logs in as the canary bot to test @me URLs;
 *                                skipped automatically when credentials are absent.
 *
 * Environment variables:
 *   GH_CANARY_USERNAME   — (Tier 2) GitHub username for the canary bot
 *   GH_CANARY_PASSWORD   — (Tier 2) GitHub password for the canary bot
 *   GMAIL_CLIENT_ID      — (Tier 2) Google OAuth2 client ID for device verification bypass
 *   GMAIL_CLIENT_SECRET  — (Tier 2) Google OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN  — (Tier 2) Google OAuth2 refresh token for the canary bot's Gmail
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PUBLIC_TARGETS,
  AUTH_TARGETS,
  HAS_CREDENTIALS,
  BROWSER_HEADERS,
} from './utils/config';
import { parseAndAssert, checkAvatarCoverage } from './utils/assertions';
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

describe('Tier 1: Public Baseline', () => {
  for (const target of PUBLIC_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
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
  }
});

// ═════════════════════════════════════════════════════════════════════════
// Tier 2: Authenticated @me URLs (Playwright login, skipped without creds)
// ═════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_CREDENTIALS)('Tier 2: Authenticated @me URLs', () => {
  const session = new GitHubSession();

  beforeAll(async () => {
    await session.launch();
  });

  for (const target of AUTH_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
      console.log(`\n── Tier 2: ${target.label} ──`);

      if (!session.isLoggedIn) {
        console.warn(`  ⊘ Skipping "${target.label}" — login did not succeed (see beforeAll logs above)`);
        return;
      }

      const html = await session.getPageHTML(target.url);
      const prs = await parseAndAssert(html, target);
      checkAvatarCoverage(prs, target.label, 2);

      console.log(`── Tier 2: ${target.label} — PASSED ──\n`);
    });
  }

  afterAll(async () => {
    await session.close();
  });
});

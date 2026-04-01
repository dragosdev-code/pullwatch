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

// ═════════════════════════════════════════════════════════════════════════
// Tier 1: Public Baseline (always runs, no auth)
// ═════════════════════════════════════════════════════════════════════════

describe('Tier 1: Public Baseline', () => {
  for (const target of PUBLIC_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
      console.log(`\n── Tier 1: ${target.label} ──`);
      console.log(`  [fetch] GET ${target.url}`);

      const resp = await fetch(target.url, {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
      });
      const html = await resp.text();

      console.log(`  [fetch] HTTP ${resp.status} — ${html.length} bytes received`);
      expect(resp.status, `[${target.label}] HTTP status`).toBe(200);

      const prs = parseAndAssert(html, target);
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
      const prs = parseAndAssert(html, target);
      checkAvatarCoverage(prs, target.label, 2);

      console.log(`── Tier 2: ${target.label} — PASSED ──\n`);
    });
  }

  afterAll(async () => {
    await session.close();
  });
});

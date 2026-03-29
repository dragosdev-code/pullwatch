/**
 * Parser Canary Tests — Hourly synthetic monitor.
 *
 * Uses Playwright to navigate live GitHub PR search pages, then runs
 * GitHubHTMLParser.parseFromHTML() against the rendered HTML and asserts
 * the extracted PR data is structurally valid.
 *
 * Strategy:
 *   - Primary targets use PUBLIC repo search URLs (always have PRs,
 *     no auth needed) to validate that the parser handles GitHub's
 *     current DOM structure.
 *   - Optional authenticated targets (via GH_CANARY_PAT) test the
 *     exact URLs the extension uses. These are informational — they
 *     don't require results since the canary bot may have no PRs.
 *
 * Environment variables:
 *   GH_CANARY_PAT  — (optional) GitHub PAT for authenticated page tests
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitHubHTMLParser } from '../extension/background/services/GitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../extension/common/default-patterns';
import type { PullRequest } from '../extension/common/types';

const GITHUB_BASE = 'https://github.com';

const REALISTIC_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface CanaryTarget {
  label: string;
  url: string;
  /** When true, the parser MUST return at least 1 PR or the test fails. */
  requireResults: boolean;
}

/**
 * Public search URLs that always have PRs (no auth needed).
 * These use the same global `/pulls?q=` format the extension uses,
 * so the HTML structure is identical to the authenticated experience.
 */
const PUBLIC_TARGETS: CanaryTarget[] = [
  {
    label: 'Public: Open PRs (facebook/react)',
    url: `${GITHUB_BASE}/pulls?q=is%3Aopen+is%3Apr+repo%3Afacebook%2Freact`,
    requireResults: true,
  },
  {
    label: 'Public: Merged PRs (microsoft/vscode)',
    url: `${GITHUB_BASE}/pulls?q=is%3Apr+is%3Amerged+repo%3Amicrosoft%2Fvscode`,
    requireResults: true,
  },
];

/**
 * Validates structural integrity of a single extracted PR.
 * Throws vitest assertion errors on any invalid field.
 */
function assertPRValid(pr: PullRequest, label: string): void {
  expect(pr.url, `[${label}] PR url`).toMatch(/\/pull\/\d+/);
  expect(pr.title, `[${label}] PR title`).toBeTruthy();
  expect(pr.title.length, `[${label}] PR title length`).toBeGreaterThan(0);

  expect(pr.number, `[${label}] PR number`).not.toBeNull();
  expect(pr.number, `[${label}] PR number > 0`).toBeGreaterThan(0);

  expect(pr.repoName, `[${label}] repoName`).toBeTruthy();
  expect(pr.repoName, `[${label}] repoName not fallback`).not.toBe('Unknown Repo');

  expect(pr.author.length, `[${label}] author array`).toBeGreaterThan(0);
  expect(pr.author[0].login, `[${label}] first author login`).toBeTruthy();

  expect(['draft', 'open', 'merged'], `[${label}] PR type`).toContain(pr.type);
}

// ────────────────────────────────────────────────────────────────────────────

describe('Parser Canary — Live GitHub HTML', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });

    context = await browser.newContext({
      userAgent: REALISTIC_UA,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    page = await context.newPage();
  });

  // ── Public targets (parser structural validation) ──────────────────

  for (const target of PUBLIC_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
      await page.goto(target.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      await page.waitForTimeout(2_000);

      const html = await page.content();

      let prs: PullRequest[];
      try {
        prs = GitHubHTMLParser.parseFromHTML(html, GITHUB_BASE, DEFAULT_COMPILED_PATTERNS);
      } catch (error) {
        const snippet = html.slice(0, 3000);
        console.error(`\n=== HTML SNIPPET (first 3000 chars) for "${target.label}" ===\n${snippet}\n===\n`);
        throw error;
      }

      console.log(`  → ${target.label}: ${prs.length} PR(s) extracted`);

      if (target.requireResults) {
        expect(
          prs.length,
          `Expected at least 1 PR from "${target.label}" — got 0. ` +
            'The parser is likely broken due to a GitHub DOM change.'
        ).toBeGreaterThan(0);
      }

      for (const pr of prs) {
        assertPRValid(pr, target.label);
      }

      if (prs.length >= 3) {
        const anyAvatarUrl = prs.some(
          (pr) => pr.author.length > 0 && pr.author.some((a) => a.avatarUrl),
        );
        if (!anyAvatarUrl) {
          console.warn(
            `  ⚠ No avatarUrl found across ${prs.length} PRs in "${target.label}". ` +
              'This may indicate a parser regression for avatar stacks.'
          );
        }
      }
    });
  }

  // ── Teardown ─────────────────────────────────────────────────────────

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });
});

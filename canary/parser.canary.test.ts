/**
 * Parser Canary Tests — Hourly synthetic monitor.
 *
 * Uses Playwright to fetch live GitHub PR search pages with a real PAT,
 * then runs GitHubHTMLParser.parseFromHTML() against the HTML and asserts
 * the extracted PR data is structurally valid.
 *
 * Environment variables:
 *   GH_CANARY_PAT  — GitHub Personal Access Token with `read:user` scope (required)
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitHubHTMLParser } from '../extension/background/services/GitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../extension/common/default-patterns';
import type { PullRequest } from '../extension/common/types';

const GITHUB_BASE = 'https://github.com';
const GH_PAT = process.env.GH_CANARY_PAT ?? '';

const REALISTIC_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface CanaryTarget {
  label: string;
  url: string;
  /** When true, the parser MUST return at least 1 PR or the test fails. */
  requireResults: boolean;
}

const CANARY_TARGETS: CanaryTarget[] = [
  {
    label: 'Assigned PRs (review-requested:@me)',
    url: `${GITHUB_BASE}/pulls?q=is%3Aopen+is%3Apr+user-review-requested%3A%40me+`,
    requireResults: false,
  },
  {
    label: 'Merged PRs (author:@me)',
    url: `${GITHUB_BASE}/pulls?q=is%3Apr+is%3Amerged+author%3A%40me`,
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
    if (!GH_PAT) {
      throw new Error(
        'GH_CANARY_PAT environment variable is required. ' +
          'Set it to a GitHub PAT with at least `read:user` scope.'
      );
    }

    // Validate PAT against the GitHub API before launching a browser
    const apiResp = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${GH_PAT}`,
        'User-Agent': REALISTIC_UA,
      },
    });
    if (!apiResp.ok) {
      throw new Error(
        `GH_CANARY_PAT validation failed (HTTP ${apiResp.status}). ` +
          'Ensure the token is valid and has `read:user` scope.'
      );
    }
    const user = (await apiResp.json()) as { login: string };
    console.log(`  ✓ Authenticated as @${user.login}`);

    browser = await chromium.launch({ headless: true });

    context = await browser.newContext({
      userAgent: REALISTIC_UA,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    page = await context.newPage();

    // Inject Authorization header only on github.com document requests
    // to avoid leaking the PAT to third-party asset domains.
    await page.route('https://github.com/**', (route) => {
      if (route.request().resourceType() === 'document') {
        return route.continue({
          headers: {
            ...route.request().headers(),
            authorization: `token ${GH_PAT}`,
          },
        });
      }
      return route.continue();
    });
  });

  // ── Per-target canary assertions ─────────────────────────────────────

  for (const target of CANARY_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
      await page.goto(target.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Allow short settle for any client-side hydration
      await page.waitForTimeout(2_000);

      const html = await page.content();

      // ── Core assertion: the page must be recognized ─────────────
      // parseFromHTML throws ParserBreakageError if the page is unrecognized.
      let prs: PullRequest[];
      try {
        prs = GitHubHTMLParser.parseFromHTML(html, GITHUB_BASE, DEFAULT_COMPILED_PATTERNS);
      } catch (error) {
        // Dump a snippet of the HTML to help diagnose what GitHub changed
        const snippet = html.slice(0, 3000);
        console.error(`\n=== HTML SNIPPET (first 3000 chars) for "${target.label}" ===\n${snippet}\n===\n`);
        throw error;
      }

      console.log(`  → ${target.label}: ${prs.length} PR(s) extracted`);

      // ── Quantity assertion (when target demands results) ────────
      if (target.requireResults) {
        expect(
          prs.length,
          `Expected at least 1 PR from "${target.label}" — got 0. ` +
            'Either the canary GitHub account has no matching PRs, or the parser is broken.'
        ).toBeGreaterThan(0);
      }

      // ── Per-PR structural validation ───────────────────────────
      for (const pr of prs) {
        assertPRValid(pr, target.label);
      }

      // ── Avatar spot-check: at least one PR should have avatar data
      //    when multiple PRs exist (GitHub renders AvatarStack on most rows).
      if (prs.length >= 3) {
        const anyAvatarUrl = prs.some(
          (pr) => pr.author.length > 0 && pr.author.some((a) => a.avatarUrl),
        );
        if (!anyAvatarUrl) {
          console.warn(
            `  ⚠ No avatarUrl found across ${prs.length} PRs in "${target.label}". ` +
              'This may indicate a parser regression or a GitHub DOM change for avatar stacks.'
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

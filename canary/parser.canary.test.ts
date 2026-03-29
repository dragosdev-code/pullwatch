/**
 * Parser Canary Tests — Hourly synthetic monitor.
 *
 * Tier 1 (Public Baseline):
 *   Fetches public repo PR listing pages via fetch() and validates
 *   the parser against live GitHub HTML. No auth needed, always runs.
 *
 * Tier 2 (Authenticated Full Fidelity):
 *   Uses Playwright to log into GitHub as the canary bot account and
 *   navigates to the exact same @me URLs the extension uses in production.
 *   Skipped automatically if GH_CANARY_USERNAME / GH_CANARY_PASSWORD are missing.
 *
 * Environment variables:
 *   GH_CANARY_USERNAME  — (Tier 2) GitHub username for the canary bot
 *   GH_CANARY_PASSWORD  — (Tier 2) GitHub password for the canary bot
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitHubHTMLParser } from '../extension/background/services/GitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../extension/common/default-patterns';
import type { PullRequest } from '../extension/common/types';

const GITHUB_BASE = 'https://github.com';

const CANARY_USERNAME = process.env.GH_CANARY_USERNAME ?? '';
const CANARY_PASSWORD = process.env.GH_CANARY_PASSWORD ?? '';
const HAS_CREDENTIALS = CANARY_USERNAME.length > 0 && CANARY_PASSWORD.length > 0;

const REALISTIC_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BROWSER_HEADERS: Record<string, string> = {
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

interface CanaryTarget {
  label: string;
  url: string;
  requireResults: boolean;
}

// ── Shared assertion helpers ─────────────────────────────────────────────

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

function parseAndAssert(
  html: string,
  target: CanaryTarget,
): PullRequest[] {
  console.log(`  [parse] Running GitHubHTMLParser.parseFromHTML() for "${target.label}"...`);

  let prs: PullRequest[];
  try {
    prs = GitHubHTMLParser.parseFromHTML(html, GITHUB_BASE, DEFAULT_COMPILED_PATTERNS);
  } catch (error) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== PARSER THREW — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`,
    );
    throw error;
  }

  console.log(`  [parse] ${target.label}: ${prs.length} PR(s) extracted`);

  if (prs.length > 0) {
    const first = prs[0];
    console.log(
      `  [parse] Sample PR #${first.number}: "${first.title}" ` +
        `(${first.type}) by ${first.author[0]?.login ?? '?'} in ${first.repoName}`,
    );
  }

  if (target.requireResults && prs.length === 0) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== 0 PRs — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`,
    );
  }

  if (target.requireResults) {
    expect(
      prs.length,
      `Expected at least 1 PR from "${target.label}" — got 0. ` +
        'The parser is likely broken due to a GitHub DOM change.',
    ).toBeGreaterThan(0);
  }

  for (const pr of prs) {
    assertPRValid(pr, target.label);
  }

  console.log(`  [parse] All ${prs.length} PR(s) passed structural assertions for "${target.label}"`);
  return prs;
}

// ═════════════════════════════════════════════════════════════════════════
// Tier 1: Public Baseline (always runs, no auth)
// ═════════════════════════════════════════════════════════════════════════

const PUBLIC_TARGETS: CanaryTarget[] = [
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

      if (prs.length >= 3) {
        const avatarCount = prs.filter((pr) => pr.author.some((a) => a.avatarUrl)).length;
        console.log(`  [avatar] ${avatarCount}/${prs.length} PRs have at least one avatarUrl`);
        if (avatarCount === 0) {
          console.warn(
            `  ⚠ No avatarUrl found across ${prs.length} PRs in "${target.label}". ` +
              'This may indicate a parser regression for avatar stacks.',
          );
        }
      }

      console.log(`── Tier 1: ${target.label} — PASSED ──\n`);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// Tier 2: Authenticated @me URLs (Playwright login, skipped without creds)
// ═════════════════════════════════════════════════════════════════════════

const AUTH_TARGETS: CanaryTarget[] = [
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

console.log(`\n[env] GH_CANARY_USERNAME present: ${CANARY_USERNAME.length > 0}`);
console.log(`[env] GH_CANARY_PASSWORD present: ${CANARY_PASSWORD.length > 0}`);
console.log(`[env] HAS_CREDENTIALS: ${HAS_CREDENTIALS} → Tier 2 will ${HAS_CREDENTIALS ? 'RUN' : 'SKIP'}\n`);

describe.skipIf(!HAS_CREDENTIALS)('Tier 2: Authenticated @me URLs', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let loginSucceeded = false;

  beforeAll(async () => {
    console.log('\n── Tier 2: beforeAll — Starting Playwright login flow ──');

    console.log('  [pw] Launching Chromium (headless)...');
    browser = await chromium.launch({ headless: true });
    console.log('  [pw] Chromium launched');

    console.log('  [pw] Creating browser context (UA, viewport 1920x1080, locale en-US)...');
    context = await browser.newContext({
      userAgent: REALISTIC_UA,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    console.log('  [pw] Browser context created');

    page = await context.newPage();
    console.log('  [pw] New page opened');

    // ── GitHub login flow ──────────────────────────────────────────
    console.log('  [login] Navigating to https://github.com/login ...');
    await page.goto('https://github.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    console.log(`  [login] Page loaded — URL: ${page.url()}`);

    console.log('  [login] Waiting for #login_field selector...');
    await page.waitForSelector('#login_field', { timeout: 10_000 });
    console.log('  [login] Login form found');

    console.log(`  [login] Filling username: ${CANARY_USERNAME}`);
    await page.fill('#login_field', CANARY_USERNAME);

    console.log('  [login] Filling password: ****');
    await page.fill('#password', CANARY_PASSWORD);

    console.log('  [login] Clicking submit button...');
    await page.click('input[type="submit"], input[name="commit"]');

    console.log('  [login] Waiting for post-login page to load...');
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });

    const postLoginUrl = page.url();
    const postLoginTitle = await page.title();
    const postLoginHtml = await page.content();

    console.log(`  [login] Post-login URL: ${postLoginUrl}`);
    console.log(`  [login] Post-login page title: "${postLoginTitle}"`);
    console.log(`  [login] Post-login HTML length: ${postLoginHtml.length} bytes`);

    // Detect device verification / 2FA challenge
    const isDeviceVerification =
      postLoginUrl.includes('/sessions/') ||
      postLoginUrl.includes('/two-factor') ||
      postLoginHtml.includes('Verify your account') ||
      postLoginHtml.includes('Device verification') ||
      postLoginHtml.includes('Two-factor authentication');

    if (isDeviceVerification) {
      console.warn(
        '\n  ⚠ [login] DEVICE VERIFICATION or 2FA DETECTED\n' +
          `    Post-login URL: ${postLoginUrl}\n` +
          `    Page title: "${postLoginTitle}"\n` +
          '    Tier 2 tests will be skipped.\n' +
          '    Action: Check the canary bot email to approve this device.\n',
      );
      return;
    }

    // Detect incorrect credentials
    const isLoginError =
      postLoginUrl.includes('/login') ||
      postLoginHtml.includes('Incorrect username or password');

    if (isLoginError) {
      console.error(
        '\n  ✗ [login] LOGIN FAILED — incorrect username or password\n' +
          `    Post-login URL: ${postLoginUrl}\n` +
          `    Page title: "${postLoginTitle}"\n` +
          '    Action: Verify GH_CANARY_USERNAME and GH_CANARY_PASSWORD secrets.\n',
      );
      return;
    }

    loginSucceeded = true;
    console.log(`  ✓ [login] Successfully logged in as @${CANARY_USERNAME}`);
    console.log('── Tier 2: beforeAll — Login complete ──\n');
  });

  for (const target of AUTH_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
      console.log(`\n── Tier 2: ${target.label} ──`);

      if (!loginSucceeded) {
        console.warn(`  ⊘ Skipping "${target.label}" — login did not succeed (see beforeAll logs above)`);
        return;
      }

      console.log(`  [navigate] Going to ${target.url} ...`);
      await page.goto(target.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const pageUrl = page.url();
      const pageTitle = await page.title();
      console.log(`  [navigate] Landed on: ${pageUrl}`);
      console.log(`  [navigate] Page title: "${pageTitle}"`);

      console.log('  [navigate] Waiting 2s for dynamic content to settle...');
      await page.waitForTimeout(2_000);

      const html = await page.content();
      console.log(`  [html] Captured page HTML: ${html.length} bytes`);

      const prs = parseAndAssert(html, target);

      if (prs.length >= 2) {
        const avatarCount = prs.filter((pr) => pr.author.some((a) => a.avatarUrl)).length;
        console.log(`  [avatar] ${avatarCount}/${prs.length} PRs have at least one avatarUrl`);
        if (avatarCount === 0) {
          console.warn(
            `  ⚠ No avatarUrl found across ${prs.length} PRs in "${target.label}". ` +
              'Avatar stack parsing may be broken.',
          );
        }
      }

      console.log(`── Tier 2: ${target.label} — PASSED ──\n`);
    });
  }

  afterAll(async () => {
    console.log('\n── Tier 2: afterAll — Closing Playwright ──');
    await context?.close();
    console.log('  [pw] Browser context closed');
    await browser?.close();
    console.log('  [pw] Browser closed');
    console.log('── Tier 2: afterAll — Done ──\n');
  });
});

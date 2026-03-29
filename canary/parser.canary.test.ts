/**
 * Parser Canary Tests — Hourly synthetic monitor.
 *
 * Fetches live GitHub PR listing pages via HTTP (matching how the extension's
 * service worker fetches HTML), then runs GitHubHTMLParser.parseFromHTML()
 * against the response and asserts the extracted PR data is structurally valid.
 *
 * Uses repo-specific PR listing pages (publicly accessible, no auth needed)
 * with the same HTML structure the extension parses in production.
 */

import { describe, it, expect } from 'vitest';
import { GitHubHTMLParser } from '../extension/background/services/GitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../extension/common/default-patterns';
import type { PullRequest } from '../extension/common/types';

const GITHUB_BASE = 'https://github.com';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

/**
 * Repo-specific PR listing pages — publicly accessible, always have PRs,
 * and use the same HTML structure as the global /pulls?q= search.
 */
const CANARY_TARGETS: CanaryTarget[] = [
  {
    label: 'Open PRs (facebook/react)',
    url: `${GITHUB_BASE}/facebook/react/pulls`,
    requireResults: true,
  },
  {
    label: 'Open PRs (microsoft/vscode)',
    url: `${GITHUB_BASE}/microsoft/vscode/pulls`,
    requireResults: true,
  },
];

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

async function fetchGitHubHTML(url: string): Promise<{ html: string; status: number }> {
  const resp = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  });
  const html = await resp.text();
  return { html, status: resp.status };
}

// ────────────────────────────────────────────────────────────────────────────

describe('Parser Canary — Live GitHub HTML', () => {
  for (const target of CANARY_TARGETS) {
    it(`should parse: ${target.label}`, async () => {
      const { html, status } = await fetchGitHubHTML(target.url);

      console.log(`  → ${target.label}: HTTP ${status}, ${html.length} bytes`);

      expect(status, `[${target.label}] HTTP status`).toBe(200);

      let prs: PullRequest[];
      try {
        prs = GitHubHTMLParser.parseFromHTML(html, GITHUB_BASE, DEFAULT_COMPILED_PATTERNS);
      } catch (error) {
        const snippet = html.slice(0, 5000);
        console.error(
          `\n=== HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n` +
            `${snippet}\n===\n`,
        );
        throw error;
      }

      console.log(`  → ${target.label}: ${prs.length} PR(s) extracted`);

      // If we expected results but got 0, dump HTML to help debug
      if (target.requireResults && prs.length === 0) {
        const snippet = html.slice(0, 5000);
        console.error(
          `\n=== 0 PRs extracted — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n` +
            `${snippet}\n===\n`,
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

      if (prs.length >= 3) {
        const anyAvatarUrl = prs.some(
          (pr) => pr.author.length > 0 && pr.author.some((a) => a.avatarUrl),
        );
        if (!anyAvatarUrl) {
          console.warn(
            `  ⚠ No avatarUrl found across ${prs.length} PRs in "${target.label}". ` +
              'This may indicate a parser regression for avatar stacks.',
          );
        }
      }
    });
  }
});

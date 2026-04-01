/**
 * Canary assertion helpers — structural validation for parsed PRs.
 *
 * These functions bridge live GitHub HTML and the extension's parser,
 * catching regressions from GitHub DOM changes before users notice.
 * Every assertion includes a descriptive label so CI failures
 * immediately reveal which target and which field broke.
 */

import { expect } from 'vitest';
import { GitHubHTMLParser } from '../../extension/background/services/GitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../../extension/common/default-patterns';
import type { PullRequest } from '../../extension/common/types';
import { GITHUB_BASE, type CanaryTarget } from './config';

/**
 * Validates that a single PR has all the fields the extension UI relies on.
 * Catches silent parser regressions where a field parses as null/empty
 * instead of throwing.
 */
export function assertPRValid(pr: PullRequest, label: string): void {
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

/**
 * Runs the production parser against raw HTML, logs diagnostics, and
 * asserts structural correctness on every extracted PR.
 *
 * When the parser throws or returns zero results on a required target,
 * the first 5 000 chars of HTML are dumped to stderr — enough context
 * to diagnose whether GitHub changed the DOM or served an error page.
 */
export function parseAndAssert(
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

/**
 * Soft-checks that at least some PRs include avatar URLs.
 *
 * This is a warning, not a hard failure, because some listing pages
 * (especially filtered @me queries) may legitimately have PRs whose
 * avatar markup differs. A zero-avatar result across many PRs is a
 * strong signal of a parser regression in the AvatarStack extractor.
 *
 * @param minPRsRequired  Only run the check when we have at least this
 *                         many PRs — too few and the signal is noise.
 */
export function checkAvatarCoverage(
  prs: PullRequest[],
  label: string,
  minPRsRequired: number,
): void {
  if (prs.length < minPRsRequired) return;

  const avatarCount = prs.filter((pr) => pr.author.some((a) => a.avatarUrl)).length;
  console.log(`  [avatar] ${avatarCount}/${prs.length} PRs have at least one avatarUrl`);

  if (avatarCount === 0) {
    console.warn(
      `  ⚠ No avatarUrl found across ${prs.length} PRs in "${label}". ` +
        'This may indicate a parser regression for avatar stacks.',
    );
  }
}

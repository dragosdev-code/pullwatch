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

  // id mirrors url in the parser (id = url), but we check it separately
  // because downstream code uses id as the deduplication key in storage.
  expect(pr.id, `[${label}] PR id`).toBeTruthy();
  expect(pr.id, `[${label}] PR id matches pull URL`).toMatch(/\/pull\/\d+/);

  // createdAt is always set by the parser — either extracted from a
  // <relative-time> element or defaulted to Date.now(). A broken timestamp
  // regex could silently produce a malformed string that passes truthy
  // checks but breaks date sorting downstream.
  expect(pr.createdAt, `[${label}] createdAt present`).toBeTruthy();
  expect(
    Number.isNaN(new Date(pr.createdAt!).getTime()),
    `[${label}] createdAt is a valid date ("${pr.createdAt}")`,
  ).toBe(false);

  // The parser hardcodes isNew to false; if this ever becomes undefined
  // it means the return shape changed and storage hydration will break.
  expect(pr.isNew, `[${label}] isNew is false`).toBe(false);
}

const GITHUB_STATUS_API = 'https://www.githubstatus.com/api/v2/status.json';

/**
 * Checks GitHub's public status API to determine whether GitHub is
 * currently reporting degraded performance or an active incident.
 * Used to disambiguate "0 PRs parsed" caused by a partial GitHub
 * outage from an actual DOM change that broke the parser.
 */
async function isGitHubDegraded(): Promise<boolean> {
  try {
    const resp = await fetch(GITHUB_STATUS_API);
    if (!resp.ok) return false;
    const data = await resp.json();
    // indicator is "none" when all systems operational, anything else
    // (minor, major, critical) signals degraded service.
    return data?.status?.indicator !== 'none';
  } catch {
    return false;
  }
}

/**
 * Runs the production parser against raw HTML, logs diagnostics, and
 * asserts structural correctness on every extracted PR.
 *
 * When the parser throws or returns zero results on a required target,
 * the first 5 000 chars of HTML are dumped to stderr — enough context
 * to diagnose whether GitHub changed the DOM or served an error page.
 *
 * When zero PRs are found on a required target, checks the GitHub
 * Status API so the failure message (and downstream Discord alert)
 * points at the right cause.
 */
export async function parseAndAssert(
  html: string,
  target: CanaryTarget,
): Promise<PullRequest[]> {
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

    // Dump the full shape so CI logs show exactly what the parser produced.
    // Avatar data URIs from authenticated pages can be multi-KB base64
    // strings, so we truncate them to keep output scannable.
    const redactedPR = {
      ...first,
      author: first.author.map((a) => ({
        ...a,
        avatarUrl: a.avatarUrl
          ? a.avatarUrl.slice(0, 60) + (a.avatarUrl.length > 60 ? '...[truncated]' : '')
          : undefined,
      })),
    };
    console.log(`  [structure] First PR shape:\n${JSON.stringify(redactedPR, null, 2)}`);
  }

  if (target.requireResults && prs.length === 0) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== 0 PRs — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`,
    );

    // GitHub can return HTTP 200 with a valid-looking page shell but no PR
    // content during partial outages (e.g., SSR failure on their end). This
    // looks identical to a DOM change from the parser's perspective. Checking
    // the status API disambiguates so the failure message (and downstream
    // Discord alert) points at the right cause.
    const degraded = await isGitHubDegraded();
    if (degraded) {
      console.warn(
        `  [status] GitHub Status API reports degraded service — this failure is likely a GitHub outage, NOT a DOM change.`,
      );
    }

    const reason = degraded
      ? 'GitHub is reporting degraded status — this is likely a transient GitHub outage, not a DOM change.'
      : 'The parser is likely broken due to a GitHub DOM change.';

    expect(
      prs.length,
      `Expected at least 1 PR from "${target.label}" — got 0. ${reason}`,
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

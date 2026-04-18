/**
 * Structural validators for parsed PRs.
 *
 * These bridge live GitHub HTML and the extension's UI contract, catching
 * silent parser regressions where a field parses as null/empty instead of
 * throwing. Every assertion includes a descriptive label so CI failures
 * immediately reveal which target and which field broke.
 */

import { expect } from 'vitest';
import type { PullRequest } from '../../extension/common/types';

/**
 * Validates that a single PR has all the fields the extension UI relies on.
 *
 * Embedded JSON rows may omit `number` while still providing a permalink URL; we infer from
 * `/pull/N` so Chapter 2 and Chapter 1 share one structural contract.
 */
export function assertPRValid(pr: PullRequest, label: string): void {
  expect(pr.url, `[${label}] PR url`).toMatch(/\/pull\/\d+/);
  expect(pr.title, `[${label}] PR title`).toBeTruthy();
  expect(pr.title.length, `[${label}] PR title length`).toBeGreaterThan(0);

  // Embedded JSON often omits `number`; permalink still carries `/pull/N` — infer so
  // structural checks match what the UI needs for sorting and deep links.
  let number = pr.number;
  if (number === null || number === undefined) {
    const m = pr.url.match(/\/pull\/(\d+)/);
    expect(m, `[${label}] PR number (from url when null)`).toBeTruthy();
    number = m ? parseInt(m[1], 10) : null;
  }
  expect(number, `[${label}] PR number`).not.toBeNull();
  expect(number, `[${label}] PR number > 0`).toBeGreaterThan(0);

  expect(pr.repoName, `[${label}] repoName`).toBeTruthy();
  expect(pr.repoName, `[${label}] repoName not fallback`).not.toBe('Unknown Repo');

  expect(pr.author.length, `[${label}] author array`).toBeGreaterThan(0);
  expect(pr.author[0].login, `[${label}] first author login`).toBeTruthy();

  expect(['draft', 'open', 'merged'], `[${label}] PR type`).toContain(pr.type);

  // id mirrors url in the legacy parser (id = url); we still assert it because downstream
  // code uses id as the deduplication key in storage.
  expect(pr.id, `[${label}] PR id`).toBeTruthy();
  expect(pr.id, `[${label}] PR id matches pull URL`).toMatch(/\/pull\/\d+/);

  // createdAt is always set by the legacy parser — either from <relative-time> or defaulted.
  // A broken timestamp regex could pass truthy checks but break date sorting downstream.
  expect(pr.createdAt, `[${label}] createdAt present`).toBeTruthy();
  expect(
    Number.isNaN(new Date(pr.createdAt!).getTime()),
    `[${label}] createdAt is a valid date ("${pr.createdAt}")`
  ).toBe(false);

  // The parser hardcodes isNew to false; if this ever becomes undefined, storage hydration breaks.
  expect(pr.isNew, `[${label}] isNew is false`).toBe(false);
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
  minPRsRequired: number
): void {
  if (prs.length < minPRsRequired) return;

  const avatarCount = prs.filter((pr) => pr.author.some((a) => a.avatarUrl)).length;
  console.log(`  [avatar] ${avatarCount}/${prs.length} PRs have at least one avatarUrl`);

  if (avatarCount === 0) {
    console.warn(
      `  ⚠ No avatarUrl found across ${prs.length} PRs in "${label}". ` +
        'This may indicate a parser regression for avatar stacks.'
    );
  }
}

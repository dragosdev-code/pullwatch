/**
 * Public canary entry points that drive the extension's parsers against live
 * GitHub HTML, log diagnostics, and enforce structural correctness.
 *
 * Chapter 1 uses {@link parseAndAssert} — legacy HTML parser only, matching
 * production's legacy route behavior for users not on the new dashboard.
 *
 * Chapter 2 uses {@link parseSearchRouteAndAssert} — JSON harvester first,
 * then new-experience HTML fallback, mirroring production's search-route
 * probe order. Observability markers for the search route are emitted by
 * {@link observeNewExperienceSearchObservability} in `dual-probe.ts`, which
 * the test file invokes *before* this function to keep marker emission
 * decoupled from pass/fail parsing logic.
 */

import { expect } from 'vitest';
import { GitHubHTMLParser } from '../../extension/background/services/GitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../../extension/common/default-patterns';
import { GITHUB_BASE_URL } from '../../extension/common/constants';
import { parsePullsListHTML } from '../../extension/common/pulls-list-parser';
import type { PullRequest } from '../../extension/common/types';
import type { CanaryTarget } from './config';
import { assertPRValid } from './assertions';
import { looksLikeNewPullsDashboard } from './dual-probe';
import { isGitHubDegraded } from './github-status';
import {
  CANARY_MARKER_EMBEDDED_JSON_DRIFT,
  CANARY_RUNBOOK_JSON_DRIFT_HINT,
} from './markers';

/**
 * Dump the first 5 000 chars of the response and log a sanitized sample PR.
 * Avatar data URIs from authenticated pages can be multi-KB base64 strings,
 * so we truncate them to keep CI output scannable.
 */
function logSamplePR(prs: PullRequest[]): void {
  if (prs.length === 0) return;
  const first = prs[0];
  console.log(
    `  [parse] Sample PR #${first.number ?? '?'}: "${first.title}" ` +
      `(${first.type}) by ${first.author[0]?.login ?? '?'} in ${first.repoName}`
  );
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

/**
 * Asserts a non-zero result for a required target, with GitHub Status API
 * disambiguation so the failure message points at the right cause.
 */
async function assertNonEmptyOrExplain(
  prs: PullRequest[],
  html: string,
  target: CanaryTarget,
  domChangeReason: string
): Promise<void> {
  if (!target.requireResults || prs.length > 0) return;

  const snippet = html.slice(0, 5000);
  console.error(
    `\n=== 0 PRs — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
  );

  const degraded = await isGitHubDegraded();
  if (degraded) {
    console.warn(
      `  [status] GitHub Status API reports degraded service — this failure is likely a GitHub outage, NOT a DOM change.`
    );
  }

  const reason = degraded
    ? 'GitHub is reporting degraded status — this is likely a transient GitHub outage, not a DOM change.'
    : domChangeReason;

  expect(
    prs.length,
    `Expected at least 1 PR from "${target.label}" — got 0. ${reason}`
  ).toBeGreaterThan(0);
}

/**
 * Runs the production legacy parser against raw HTML, logs diagnostics, and
 * asserts structural correctness on every extracted PR.
 *
 * When the parser throws or returns zero results on a required target, the
 * first 5 000 chars of HTML are dumped to stderr — enough context to diagnose
 * whether GitHub changed the DOM or served an error page.
 */
export async function parseAndAssert(html: string, target: CanaryTarget): Promise<PullRequest[]> {
  console.log(`  [parse] Running GitHubHTMLParser.parseFromHTML() for "${target.label}"...`);

  let prs: PullRequest[];
  try {
    prs = GitHubHTMLParser.parseFromHTML(html, GITHUB_BASE_URL, DEFAULT_COMPILED_PATTERNS);
  } catch (error) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== PARSER THREW — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
    );
    throw error;
  }

  console.log(`  [parse] ${target.label}: ${prs.length} PR(s) extracted`);
  logSamplePR(prs);

  // GitHub can return HTTP 200 with a valid-looking page shell but no PR
  // content during partial outages (e.g., SSR failure on their end). This
  // looks identical to a DOM change from the parser's perspective — the
  // status API check disambiguates.
  await assertNonEmptyOrExplain(
    prs,
    html,
    target,
    'The parser is likely broken due to a GitHub DOM change.'
  );

  for (const pr of prs) {
    assertPRValid(pr, target.label);
  }

  console.log(
    `  [parse] All ${prs.length} PR(s) passed structural assertions for "${target.label}"`
  );
  return prs;
}

/**
 * Uses the same {@link parsePullsListHTML} gauntlet as production (`GitHubService`):
 * embedded JSON → new-experience HTML → legacy HTML. Optional JSON probe result
 * enforces `requireEmbeddedJson` on merged targets when the page matches the
 * new-dashboard marker from shipped patterns.
 */
export async function parseSearchRouteAndAssert(
  html: string,
  target: CanaryTarget
): Promise<PullRequest[]> {
  let jsonProbed: PullRequest[] | null = null;

  let prs: PullRequest[];
  try {
    prs = parsePullsListHTML(html, GITHUB_BASE_URL, DEFAULT_COMPILED_PATTERNS, {
      onJsonProbed(result) {
        jsonProbed = result;
      },
    });
  } catch (error) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== SEARCH ROUTE PARSE THREW — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
    );
    throw error;
  }

  // Redundant guard when `observeNewExperienceSearchObservability` already ran, but keeps
  // this helper safe if called alone and enforces requireEmbeddedJson on merged targets.
  if (target.requireEmbeddedJson && looksLikeNewPullsDashboard(html) && jsonProbed === null) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== ${CANARY_MARKER_EMBEDDED_JSON_DRIFT} (requireEmbeddedJson) ===\n${snippet}\n===\n`
    );
    throw new Error(
      `${CANARY_MARKER_EMBEDDED_JSON_DRIFT}: requireEmbeddedJson for "${target.label}" but embedded JSON harvester returned null. ${CANARY_RUNBOOK_JSON_DRIFT_HINT}`
    );
  }

  console.log(
    `  [parse] ${target.label}: ${prs.length} PR(s) from shared parsePullsListHTML waterfall (JSON → new HTML → legacy)`
  );

  logSamplePR(prs);

  await assertNonEmptyOrExplain(
    prs,
    html,
    target,
    'The search-route parser is likely broken due to a GitHub change.'
  );

  for (const pr of prs) {
    assertPRValid(pr, target.label);
  }

  console.log(
    `  [parse] All ${prs.length} PR(s) passed structural assertions for "${target.label}"`
  );
  return prs;
}

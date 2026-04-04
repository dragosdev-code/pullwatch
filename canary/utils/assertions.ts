/**
 * Canary assertion helpers — structural validation for parsed PRs.
 *
 * These functions bridge live GitHub HTML and the extension's parser,
 * catching regressions from GitHub DOM changes before users notice.
 * Every assertion includes a descriptive label so CI failures
 * immediately reveal which target and which field broke.
 */

import { expect } from 'vitest';
import { GitHubEmbeddedJsonPullHarvest } from '../../extension/background/services/GitHubEmbeddedJsonPullHarvest';
import { GitHubHTMLParser } from '../../extension/background/services/GitHubHTMLParser';
import { NewExperienceGitHubHTMLParser } from '../../extension/background/services/NewExperienceGitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '../../extension/common/default-patterns';
import type { PullRequest } from '../../extension/common/types';
import { GITHUB_BASE, type CanaryTarget } from './config';

/**
 * Stable substring for `grep` in CI and for Discord routing. Emitted when the new-dashboard
 * page is present but the SSR JSON path is broken — users lose the primary extraction path.
 */
export const CANARY_MARKER_EMBEDDED_JSON_DRIFT = 'CANARY_EMBEDDED_JSON_DRIFT';

/**
 * Stable substring for NOTICE-level Discord when JSON still works but the HTML fallback
 * does not match (or count-align). CI stays green so paging reflects “fix before JSON goes away”.
 */
export const CANARY_MARKER_NEW_HTML_FALLBACK_DEGRADED = 'CANARY_NEW_HTML_FALLBACK_DEGRADED';

/** Canonical key for matching the same PR row across JSON harvest vs HTML scrape. */
function normalizePullUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || u.pathname;
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function inferNumberFromPullUrl(pr: PullRequest): number | null {
  if (pr.number != null && pr.number > 0) return pr.number;
  const m = pr.url.match(/\/pull\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Decode a small subset of entities so JSON plain text and DOM-derived titles compare fairly. */
function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'");
}

function normalizeTitleForCompare(title: string): string {
  return decodeBasicHtmlEntities(title.trim()).replace(/\s+/g, ' ');
}

/**
 * When embedded JSON and the new-experience HTML parser both return the same row count,
 * require per-PR agreement on fields the UI relies on. JSON is treated as ground truth for
 * the SSR payload; HTML must scrape the same logical row (not just the same cardinality).
 */
function assertNewExperienceJsonHtmlFieldAlignment(
  jsonPrs: PullRequest[],
  htmlPrs: PullRequest[],
  targetLabel: string,
): void {
  const jsonKeys = jsonPrs.map((p) => normalizePullUrl(p.url));
  expect(
    new Set(jsonKeys).size,
    `[${targetLabel}] duplicate normalized PR urls in embedded JSON`,
  ).toBe(jsonPrs.length);

  const htmlByKey = new Map<string, PullRequest>();
  for (const hp of htmlPrs) {
    htmlByKey.set(normalizePullUrl(hp.url), hp);
  }

  expect(
    htmlByKey.size,
    `[${targetLabel}] HTML parser produced duplicate normalized URLs (cannot align 1:1 with JSON)`,
  ).toBe(htmlPrs.length);

  for (let i = 0; i < jsonPrs.length; i++) {
    const jp = jsonPrs[i];
    const key = normalizePullUrl(jp.url);
    const hp = htmlByKey.get(key);

    expect(
      hp,
      `[${targetLabel}] row ${i + 1}/${jsonPrs.length}: no HTML parser row for JSON PR url ${jp.url}`,
    ).toBeDefined();

    const htmlRow = hp!;

    expect(
      normalizeTitleForCompare(htmlRow.title),
      `[${targetLabel}] PR ${key} title (HTML vs embedded JSON)`,
    ).toBe(normalizeTitleForCompare(jp.title));

    expect(htmlRow.repoName, `[${targetLabel}] PR ${key} repoName`).toBe(jp.repoName);
    expect(htmlRow.type, `[${targetLabel}] PR ${key} type`).toBe(jp.type);

    const jn = inferNumberFromPullUrl(jp);
    const hn = inferNumberFromPullUrl(htmlRow);
    expect(jn, `[${targetLabel}] PR ${key} number from JSON/url`).not.toBeNull();
    expect(hn, `[${targetLabel}] PR ${key} number from HTML/url`).not.toBeNull();
    expect(hn, `[${targetLabel}] PR ${key} number HTML vs JSON`).toBe(jn);

    const jLogin = jp.author[0]?.login;
    const hLogin = htmlRow.author[0]?.login;
    expect(jLogin, `[${targetLabel}] PR ${key} JSON author.login`).toBeTruthy();
    expect(hLogin, `[${targetLabel}] PR ${key} HTML author.login`).toBeTruthy();
    expect(hLogin, `[${targetLabel}] PR ${key} author login HTML vs JSON`).toBe(jLogin);

    const jc = jp.createdAt;
    const hc = htmlRow.createdAt;
    expect(jc, `[${targetLabel}] PR ${key} JSON createdAt`).toBeTruthy();
    expect(hc, `[${targetLabel}] PR ${key} HTML createdAt`).toBeTruthy();
    const jt = new Date(jc!).getTime();
    const ht = new Date(hc!).getTime();
    expect(Number.isNaN(jt), `[${targetLabel}] PR ${key} JSON createdAt parseable`).toBe(false);
    expect(Number.isNaN(ht), `[${targetLabel}] PR ${key} HTML createdAt parseable`).toBe(false);
    // Same instant; allow 1s slack for sub-second rounding between payload vs DOM attribute.
    expect(
      Math.abs(jt - ht),
      `[${targetLabel}] PR ${key} createdAt skew (JSON "${jc}" vs HTML "${hc}")`,
    ).toBeLessThanOrEqual(1000);
  }
}

/**
 * Heuristic: page is the new global pulls dashboard (SSR blob or route payload markers).
 * Used to avoid treating login walls as JSON drift.
 */
export function looksLikeNewPullsDashboard(html: string): boolean {
  return (
    html.includes('pullsDashboardSurfaceContentRoute') ||
    /data-target=["']react-app\.embeddedData["']/i.test(html)
  );
}

/**
 * SRE observability for Chapter 2: critical JSON drift vs HTML fallback degradation.
 *
 * - Critical: new surface markers present but `extractFromHTML` returns `null` → throws
 *   with {@link CANARY_MARKER_EMBEDDED_JSON_DRIFT}.
 * - Degraded: JSON returned rows but new HTML parser is null, empty, or count-mismatched →
 *   `console.warn` with {@link CANARY_MARKER_NEW_HTML_FALLBACK_DEGRADED}; does not throw.
 */
export function observeNewExperienceSearchObservability(html: string, targetLabel: string): void {
  if (!looksLikeNewPullsDashboard(html)) {
    return;
  }

  const jsonPrs = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);
  if (jsonPrs === null) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== ${CANARY_MARKER_EMBEDDED_JSON_DRIFT} — embedded JSON missing or untraversable ===\n` +
        `Target: "${targetLabel}"\n${snippet}\n===\n`
    );
    throw new Error(
      `${CANARY_MARKER_EMBEDDED_JSON_DRIFT}: New pulls dashboard HTML present but GitHubEmbeddedJsonPullHarvest.extractFromHTML returned null for "${targetLabel}".`
    );
  }

  // Dual probe: always run the new-experience HTML parser when JSON ran, even though
  // production would stop after JSON — live pages usually include both SSR JSON and DOM, so
  // this is how we detect fallback rot without stripping the script tag.
  const htmlPrs = NewExperienceGitHubHTMLParser.parseFromHTML(
    html,
    GITHUB_BASE,
    DEFAULT_COMPILED_PATTERNS
  );

  const htmlCountLabel =
    htmlPrs === null ? 'null (new-experience HTML patterns did not match this document)' : `${htmlPrs.length} PR(s)`;

  // No PR rows from JSON — skip count parity (would be noise), but still log the HTML probe so
  // CI proves NewExperienceGitHubHTMLParser ran on the same snapshot as the harvester.
  if (jsonPrs.length === 0) {
    console.log(
      `  [parse] NewExperienceGitHubHTMLParser dual-probe "${targetLabel}": embedded JSON=0 PRs, HTML=${htmlCountLabel} — count alignment not evaluated when JSON list is empty.`,
    );
    return;
  }

  const htmlLen = htmlPrs === null ? null : htmlPrs.length;
  const degraded = htmlPrs === null || htmlPrs.length === 0 || htmlPrs.length !== jsonPrs.length;

  if (degraded) {
    console.warn(
      `${CANARY_MARKER_NEW_HTML_FALLBACK_DEGRADED} ` +
        `target="${targetLabel}" jsonPrs=${jsonPrs.length} newExperienceHtmlPrs=${htmlLen === null ? 'null' : htmlLen} ` +
        `— primary JSON path works; update NewExperienceGitHubHTMLParser / newExperience patterns before JSON changes.`
    );
  } else {
    // Visible proof in logs that the HTML fallback path still parses the live DOM (dual-path §2e),
    // even though parseSearchRouteAndAssert stops after JSON — production only hits HTML when JSON is null.
    assertNewExperienceJsonHtmlFieldAlignment(jsonPrs, htmlPrs!, targetLabel);
    console.log(
      `  [parse] NewExperienceGitHubHTMLParser dual-probe "${targetLabel}": ${htmlPrs!.length} PR(s) — ` +
        `embedded JSON and HTML scrape agree on url, title, repo, type, author, number, createdAt.`,
    );
  }
}

/**
 * Mirrors production `parseSearchRoute` in `GitHubService`: try embedded JSON first (stable
 * against CSS churn), then `NewExperienceGitHubHTMLParser` if the blob is absent.
 *
 * Throws if both probes return `null` — same failure mode as `ParserBreakageError` on the
 * search route in the extension.
 */
export async function parseSearchRouteAndAssert(
  html: string,
  target: CanaryTarget
): Promise<PullRequest[]> {
  // Redundant guard when `observeNewExperienceSearchObservability` already ran, but keeps
  // this helper safe if called alone and enforces requireEmbeddedJson on merged targets.
  if (target.requireEmbeddedJson && looksLikeNewPullsDashboard(html)) {
    const probe = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);
    if (probe === null) {
      const snippet = html.slice(0, 5000);
      console.error(
        `\n=== ${CANARY_MARKER_EMBEDDED_JSON_DRIFT} (requireEmbeddedJson) ===\n${snippet}\n===\n`
      );
      throw new Error(
        `${CANARY_MARKER_EMBEDDED_JSON_DRIFT}: requireEmbeddedJson for "${target.label}" but harvester returned null.`
      );
    }
  }

  console.log(
    `  [parse] Search route: trying GitHubEmbeddedJsonPullHarvest for "${target.label}"...`
  );
  const jsonPrs = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);

  let prs: PullRequest[];
  if (jsonPrs !== null) {
    prs = jsonPrs;
    console.log(`  [parse] ${target.label}: ${prs.length} PR(s) from embedded JSON`);
  } else {
    console.log(
      `  [parse] JSON N/A — trying NewExperienceGitHubHTMLParser for "${target.label}"...`
    );
    const htmlPrs = NewExperienceGitHubHTMLParser.parseFromHTML(
      html,
      GITHUB_BASE,
      DEFAULT_COMPILED_PATTERNS
    );
    if (htmlPrs === null) {
      const snippet = html.slice(0, 5000);
      console.error(
        `\n=== SEARCH ROUTE PARSE FAILED — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
      );
      throw new Error(
        `Search route: both JSON harvester and NewExperienceGitHubHTMLParser returned null for "${target.label}".`
      );
    }
    prs = htmlPrs;
    console.log(`  [parse] ${target.label}: ${prs.length} PR(s) from new-experience HTML parser`);
  }

  if (prs.length > 0) {
    const first = prs[0];
    console.log(
      `  [parse] Sample PR #${first.number ?? '?'}: "${first.title}" ` +
        `(${first.type}) by ${first.author[0]?.login ?? '?'} in ${first.repoName}`
    );

    // Same redaction rationale as legacy parse: keep logs readable in CI.
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
      `\n=== 0 PRs — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
    );

    // Same outage vs DOM disambiguation as legacy parse — search-route shells can also be empty during incidents.
    const degraded = await isGitHubDegraded();
    if (degraded) {
      console.warn(
        `  [status] GitHub Status API reports degraded service — this failure is likely a GitHub outage, NOT a DOM change.`
      );
    }

    const reason = degraded
      ? 'GitHub is reporting degraded status — this is likely a transient GitHub outage, not a DOM change.'
      : 'The search-route parser is likely broken due to a GitHub change.';

    expect(
      prs.length,
      `Expected at least 1 PR from "${target.label}" — got 0. ${reason}`
    ).toBeGreaterThan(0);
  }

  for (const pr of prs) {
    assertPRValid(pr, target.label);
  }

  console.log(
    `  [parse] All ${prs.length} PR(s) passed structural assertions for "${target.label}"`
  );
  return prs;
}

/**
 * Validates that a single PR has all the fields the extension UI relies on.
 * Catches silent parser regressions where a field parses as null/empty
 * instead of throwing.
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
 * Runs the production legacy parser against raw HTML, logs diagnostics, and
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
export async function parseAndAssert(html: string, target: CanaryTarget): Promise<PullRequest[]> {
  console.log(`  [parse] Running GitHubHTMLParser.parseFromHTML() for "${target.label}"...`);

  let prs: PullRequest[];
  try {
    prs = GitHubHTMLParser.parseFromHTML(html, GITHUB_BASE, DEFAULT_COMPILED_PATTERNS);
  } catch (error) {
    const snippet = html.slice(0, 5000);
    console.error(
      `\n=== PARSER THREW — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
    );
    throw error;
  }

  console.log(`  [parse] ${target.label}: ${prs.length} PR(s) extracted`);

  if (prs.length > 0) {
    const first = prs[0];
    console.log(
      `  [parse] Sample PR #${first.number}: "${first.title}" ` +
        `(${first.type}) by ${first.author[0]?.login ?? '?'} in ${first.repoName}`
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
      `\n=== 0 PRs — HTML SNIPPET (first 5000 chars) for "${target.label}" ===\n${snippet}\n===\n`
    );

    // GitHub can return HTTP 200 with a valid-looking page shell but no PR
    // content during partial outages (e.g., SSR failure on their end). This
    // looks identical to a DOM change from the parser's perspective. Checking
    // the status API disambiguates so the failure message (and downstream
    // Discord alert) points at the right cause.
    const degraded = await isGitHubDegraded();
    if (degraded) {
      console.warn(
        `  [status] GitHub Status API reports degraded service — this failure is likely a GitHub outage, NOT a DOM change.`
      );
    }

    const reason = degraded
      ? 'GitHub is reporting degraded status — this is likely a transient GitHub outage, not a DOM change.'
      : 'The parser is likely broken due to a GitHub DOM change.';

    expect(
      prs.length,
      `Expected at least 1 PR from "${target.label}" — got 0. ${reason}`
    ).toBeGreaterThan(0);
  }

  for (const pr of prs) {
    assertPRValid(pr, target.label);
  }

  console.log(
    `  [parse] All ${prs.length} PR(s) passed structural assertions for "${target.label}"`
  );
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

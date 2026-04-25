/**
 * Chapter 2 observability — distinguishes CRITICAL JSON drift from WARN-only
 * HTML fallback degradation.
 *
 * In production the waterfall stops after the first non-null probe, so we
 * never learn whether the *secondary* path also parses the same DOM. The
 * canary deliberately runs both probes on every authenticated search-route
 * fetch so fallback rot surfaces weeks before JSON disappears.
 *
 * - CRITICAL: new-dashboard markers present but `GitHubEmbeddedJsonPullHarvest`
 *   returns `null` → throw with {@link CANARY_MARKER_EMBEDDED_JSON_DRIFT}.
 * - DEGRADED: JSON returned rows but the new HTML parser is null, empty, or
 *   count-mismatched → `console.warn` with
 *   {@link CANARY_MARKER_NEW_HTML_FALLBACK_DEGRADED}; test passes.
 */

import { expect } from 'vitest';
import { GitHubEmbeddedJsonPullHarvest } from '@background/services/GitHubEmbeddedJsonPullHarvest';
import { NewExperienceGitHubHTMLParser } from '@background/services/NewExperienceGitHubHTMLParser';
import { DEFAULT_COMPILED_PATTERNS } from '@common/default-patterns';
import { GITHUB_BASE_URL } from '@common/constants';
import type { PullRequest } from '@common/types';
import {
  CANARY_MARKER_EMBEDDED_JSON_DRIFT,
  CANARY_MARKER_NEW_HTML_FALLBACK_DEGRADED,
  CANARY_RUNBOOK_JSON_DRIFT_HINT,
} from './markers';
import {
  inferNumberFromPullUrl,
  normalizePullUrl,
  normalizeTitleForCompare,
} from './text-normalization';

/**
 * True when the HTML carries the new-experience `pageMarker` from the shipped pattern
 * registry — same signal `NewExperienceGitHubHTMLParser` uses before parsing rows.
 */
export function looksLikeNewPullsDashboard(html: string): boolean {
  const ne = DEFAULT_COMPILED_PATTERNS.newExperience;
  return ne ? ne.pageMarker.compiled.test(html) : false;
}

/**
 * When embedded JSON and the new-experience HTML parser both return the same row count,
 * require per-PR agreement on fields the UI relies on. JSON is treated as ground truth for
 * the SSR payload; HTML must scrape the same logical row (not just the same cardinality).
 */
export function assertNewExperienceJsonHtmlFieldAlignment(
  jsonPrs: PullRequest[],
  htmlPrs: PullRequest[],
  targetLabel: string
): void {
  const jsonKeys = jsonPrs.map((p) => normalizePullUrl(p.url));
  expect(
    new Set(jsonKeys).size,
    `[${targetLabel}] duplicate normalized PR urls in embedded JSON`
  ).toBe(jsonPrs.length);

  const htmlByKey = new Map<string, PullRequest>();
  for (const hp of htmlPrs) {
    htmlByKey.set(normalizePullUrl(hp.url), hp);
  }

  expect(
    htmlByKey.size,
    `[${targetLabel}] HTML parser produced duplicate normalized URLs (cannot align 1:1 with JSON)`
  ).toBe(htmlPrs.length);

  for (let i = 0; i < jsonPrs.length; i++) {
    const jp = jsonPrs[i];
    const key = normalizePullUrl(jp.url);
    const hp = htmlByKey.get(key);

    expect(
      hp,
      `[${targetLabel}] row ${i + 1}/${jsonPrs.length}: no HTML parser row for JSON PR url ${jp.url}`
    ).toBeDefined();

    const htmlRow = hp!;

    expect(
      normalizeTitleForCompare(htmlRow.title),
      `[${targetLabel}] PR ${key} title (HTML vs embedded JSON)`
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
      `[${targetLabel}] PR ${key} createdAt skew (JSON "${jc}" vs HTML "${hc}")`
    ).toBeLessThanOrEqual(1000);
  }
}

/**
 * SRE observability for Chapter 2: runs the JSON harvester and the new-HTML
 * parser in parallel against the same live DOM, emits the CI marker matching
 * whichever path has drifted, and asserts field-alignment when both agree.
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
      `${CANARY_MARKER_EMBEDDED_JSON_DRIFT}: New pulls dashboard HTML present but GitHubEmbeddedJsonPullHarvest.extractFromHTML returned null for "${targetLabel}". ${CANARY_RUNBOOK_JSON_DRIFT_HINT}`
    );
  }

  // Dual probe: always run the new-experience HTML parser when JSON ran, even though
  // production would stop after JSON — live pages usually include both SSR JSON and DOM, so
  // this is how we detect fallback rot without stripping the script tag.
  const htmlPrs = NewExperienceGitHubHTMLParser.parseFromHTML(
    html,
    GITHUB_BASE_URL,
    DEFAULT_COMPILED_PATTERNS
  );

  const htmlCountLabel =
    htmlPrs === null
      ? 'null (new-experience HTML patterns did not match this document)'
      : `${htmlPrs.length} PR(s)`;

  // No PR rows from JSON — skip count parity (would be noise), but still log the HTML probe so
  // CI proves NewExperienceGitHubHTMLParser ran on the same snapshot as the harvester.
  if (jsonPrs.length === 0) {
    console.log(
      `  [parse] NewExperienceGitHubHTMLParser dual-probe "${targetLabel}": embedded JSON=0 PRs, HTML=${htmlCountLabel} — count alignment not evaluated when JSON list is empty.`
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
        `embedded JSON and HTML scrape agree on url, title, repo, type, author, number, createdAt.`
    );
  }
}

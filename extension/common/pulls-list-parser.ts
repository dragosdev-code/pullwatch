/**
 * Shared pulls-list parsing gauntlet.
 *
 * Every pulls-list HTML response — regardless of whether the caller used
 * `/pulls` or `/pulls/search` — flows through the same probe order:
 *
 *   1. Embedded SSR JSON (most stable against CSS churn)
 *   2. New-experience HTML parser (hashed CSS Modules, data-testid)
 *   3. Legacy HTML parser (the historical path)
 *
 * Production calls {@link parsePullsListHTML} with no observer. The canary
 * suite passes an observer so the hourly monitor can emit CI markers
 * (`CANARY_EMBEDDED_JSON_DRIFT`, `CANARY_NEW_HTML_FALLBACK_DEGRADED`)
 * without hand-rolling its own waterfall. If this file changes, both the
 * extension and the canary pick up the new ordering automatically.
 */

import type { PullRequest } from './types';
import type { CompiledPatterns } from './pattern-types';
import { GitHubEmbeddedJsonPullHarvest } from '../background/services/GitHubEmbeddedJsonPullHarvest';
import { NewExperienceGitHubHTMLParser } from '../background/services/NewExperienceGitHubHTMLParser';
import { GitHubHTMLParser } from '../background/services/GitHubHTMLParser';

/**
 * Observer hooks invoked after each probe in the waterfall.
 *
 * Each callback receives the raw probe result: `null` when the probe
 * declined to match the document (so the waterfall moves on), an empty
 * array when the probe recognized the page but found zero rows, or a
 * non-empty array when the probe succeeded.
 *
 * The canary uses these to emit observability markers; production does not
 * pass an observer. Callbacks must not throw — doing so would change
 * production behavior.
 */
export interface ParsePullsListObserver {
  onJsonProbed?(result: PullRequest[] | null): void;
  onNewHtmlProbed?(result: PullRequest[] | null): void;
  onLegacyHtmlProbed?(result: PullRequest[]): void;
}

/**
 * Run the three-stage parser gauntlet against a pulls-list HTML document.
 *
 * Returns the first non-null result. The legacy parser never returns null
 * (it either returns rows or throws {@link ParserBreakageError}), so this
 * function always returns a defined value or propagates.
 */
export function parsePullsListHTML(
  html: string,
  baseUrl: string,
  patterns: CompiledPatterns,
  observer?: ParsePullsListObserver
): PullRequest[] {
  const jsonResult = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);
  observer?.onJsonProbed?.(jsonResult);
  if (jsonResult !== null) return jsonResult;

  const newExpResult = NewExperienceGitHubHTMLParser.parseFromHTML(html, baseUrl, patterns);
  observer?.onNewHtmlProbed?.(newExpResult);
  if (newExpResult !== null) return newExpResult;

  const legacyResult = GitHubHTMLParser.parseFromHTML(html, baseUrl, patterns);
  observer?.onLegacyHtmlProbed?.(legacyResult);
  return legacyResult;
}

import type { PullRequest } from '@common/types';
import {
  normalizeIsoTimestamp,
  sortPullRequestsByEventTime,
} from '@common/pull-request-timestamp';

/**
 * Shape of a single PR entry inside GitHub's embedded dashboard JSON.
 * These keys mirror the actual server payload — they are NOT a public API
 * and may change without notice, which is why the harvester is one probe
 * in a multi-strategy waterfall rather than the sole extraction path.
 */
interface EmbeddedPullEntry {
  author?: { displayLogin?: string };
  createdAt?: string;
  updatedAt?: string;
  displayState?: string;
  id?: number;
  isDraft?: boolean;
  number?: number;
  permalink?: string;
  repoNameWithOwner?: string;
  state?: string;
  title?: string;
}

/**
 * Regex targeting the SSR data blob that GitHub's new React-based pulls
 * dashboard injects into the initial HTML response.
 *
 * - `data-target` is specific enough to avoid false positives; we omit
 *   the `type` attribute from the match so attribute ordering doesn't matter.
 * - Case-insensitive (`i`) guards against minifiers altering tag casing.
 * - Lazy `[\s\S]*?` stops at the first `</script>` — safe because valid
 *   JSON cannot contain a literal `</script>` (the `/` would be escaped).
 */
const EMBEDDED_JSON_RE =
  /<script[^>]*data-target="react-app\.embeddedData"[^>]*>([\s\S]*?)<\/script>/i;

/**
 * Pure static utility for extracting pull-request data from the embedded
 * JSON blob that GitHub's new React-based global pulls dashboard renders
 * as server-side data inside a `<script>` tag.
 *
 * Exists as a complement to {@link GitHubHTMLParser}: the HTML parser
 * handles the legacy experience, while this harvester targets the new
 * dashboard's structured SSR payload — a more reliable extraction source
 * when present, since it sidesteps hashed CSS classes and DOM churn.
 *
 * Designed for the same caller contract as `GitHubHTMLParser`: receives
 * a raw HTML string, returns an array of `PullRequest` objects (or `null`
 * when the embedded structure is absent). No fetching, no side-effects.
 */
export class GitHubEmbeddedJsonPullHarvest {
  /**
   * Attempts to extract PR data from the embedded JSON in the raw HTML.
   *
   * @returns `null` when the page does not contain the new-dashboard
   *          embedded JSON — signals the upstream router to try the next
   *          extraction strategy. An empty array means the structure was
   *          found but contains zero matching PRs (a valid result that
   *          should NOT trigger fallback).
   */
  static extractFromHTML(html: string): PullRequest[] | null {
    const json = GitHubEmbeddedJsonPullHarvest.extractEmbeddedJson(html);
    if (json === null) return null;

    const results = GitHubEmbeddedJsonPullHarvest.traverseToResults(json);
    if (results === null) return null;

    const prs = results
      .map((entry) => GitHubEmbeddedJsonPullHarvest.mapToPullRequest(entry))
      .filter((pr): pr is PullRequest => pr !== null);

    return sortPullRequestsByEventTime(prs);
  }

  /**
   * Locates the `react-app.embeddedData` script tag in the HTML and
   * parses its content as JSON.
   *
   * @returns The parsed object, or `null` when the tag is missing or
   *          the content is not valid JSON (malformed payload after a
   *          GitHub deploy, for instance).
   */
  private static extractEmbeddedJson(html: string): unknown {
    const match = html.match(EMBEDDED_JSON_RE);
    if (!match?.[1]) return null;

    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  /**
   * Navigates the parsed JSON to
   * `payload.pullsDashboardSurfaceContentRoute.results`.
   *
   * Every level is validated with `typeof` / `in` / `Array.isArray` — no
   * `as` casts on untrusted data — so a shape change in GitHub's payload
   * produces a clean `null` rather than a runtime exception.
   */
  private static traverseToResults(json: unknown): EmbeddedPullEntry[] | null {
    if (typeof json !== 'object' || json === null) return null;
    if (!('payload' in json)) return null;

    const payload = (json as Record<string, unknown>).payload;
    if (typeof payload !== 'object' || payload === null) return null;
    if (!('pullsDashboardSurfaceContentRoute' in payload)) return null;

    const route = (payload as Record<string, unknown>).pullsDashboardSurfaceContentRoute;
    if (typeof route !== 'object' || route === null) return null;
    if (!('results' in route)) return null;

    const results = (route as Record<string, unknown>).results;
    if (!Array.isArray(results)) return null;

    return results as EmbeddedPullEntry[];
  }

  /**
   * Maps a single entry from GitHub's embedded JSON to the extension's
   * {@link PullRequest} interface.
   *
   * Requires at minimum `permalink` and `title` — the same guard
   * `GitHubHTMLParser.extractPRData` uses (`!prUrl || !title`). Entries
   * missing either field are silently skipped so one malformed row
   * doesn't break the entire list.
   */
  private static mapToPullRequest(entry: EmbeddedPullEntry): PullRequest | null {
    const permalink = entry.permalink;
    const title = entry.title;

    if (!permalink || !title) return null;

    const authorLogin = entry.author?.displayLogin ?? 'Unknown Author';

    const createdAt = normalizeIsoTimestamp(entry.createdAt);
    const updatedAt = normalizeIsoTimestamp(entry.updatedAt);
    const eventAt = updatedAt ?? createdAt;

    return {
      id: permalink,
      url: permalink,
      html_url: permalink,
      title,
      number: entry.number ?? null,
      repoName: entry.repoNameWithOwner ?? 'Unknown Repo',
      author: [{ login: authorLogin }],
      createdAt: createdAt ?? new Date().toISOString(),
      updatedAt,
      eventAt,
      eventAtKind: updatedAt ? 'updated' : createdAt ? 'created' : 'unknown',
      timestampParseFailed: !eventAt,
      type: GitHubEmbeddedJsonPullHarvest.resolvePRType(entry),
      isNew: false,
    };
  }

  /**
   * Derives the extension's tri-state PR type from GitHub's `isDraft`
   * flag and `state` string. Draft takes precedence — a draft PR also
   * reports `state: "OPEN"`, but the extension treats drafts as their
   * own category for notification filtering.
   */
  private static resolvePRType(entry: EmbeddedPullEntry): 'draft' | 'open' | 'merged' {
    if (entry.isDraft === true) return 'draft';
    if (entry.state === 'MERGED') return 'merged';
    return 'open';
  }
}

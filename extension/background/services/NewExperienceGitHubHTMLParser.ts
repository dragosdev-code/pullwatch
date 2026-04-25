import type { PullRequest } from '@common/types';
import type {
  CompiledPatterns,
  CompiledNewExperiencePatterns,
  CompiledPattern,
  CompiledPatternTypeEntry,
} from '@common/pattern-types';
import { ParserBreakageError } from '@common/errors';

/**
 * Pure static utility for parsing GitHub's **new** React-based global pulls
 * dashboard HTML. All regex patterns are injected via
 * {@link CompiledPatterns.newExperience} — the parser itself contains zero
 * hardcoded selectors, matching the architecture of {@link GitHubHTMLParser}.
 *
 * Acts as the **secondary probe** in the waterfall: when the JSON Harvester
 * finds the new-experience embedded JSON but it yields no PRs (empty
 * `results`, shape drift), this parser attempts to extract PRs from the
 * same page's HTML before the router falls back to the legacy parser.
 *
 * GitHub's new DOM uses CSS Modules with hashed class suffixes
 * (e.g. `ListItem-module__listItem__wBJcm`). The default patterns target
 * **stable prefixes** and `data-testid` attributes, not hashes.
 *
 * The same parser runs on **full HTML documents** (`/pulls`) and **smaller
 * fragments** (`/pulls/search`). Markers must live in the list subtree
 * (`pageMarker`, `results-count`, row selectors), not only in wrappers that
 * appear on full-page responses.
 */
export class NewExperienceGitHubHTMLParser {
  /**
   * Attempts to parse PR data from the new-experience HTML.
   *
   * @returns `null` when the page does not contain new-experience
   *          structural markers OR when the compiled patterns for the
   *          new experience are not available (pre-upgrade remote config).
   *          An empty array means the markers were found but no PR rows
   *          were extracted and GitHub did not advertise a non-zero result count
   *          (`data-testid="results-count"`) — a valid empty list that should
   *          NOT trigger fallback.
   * @throws {ParserBreakageError} when `resultsCount` matches a positive integer
   *         but row extraction produced zero PRs (row CSS / selectors are broken).
   */
  static parseFromHTML(
    html: string,
    baseURL: string,
    patterns: CompiledPatterns,
  ): PullRequest[] | null {
    const ne = patterns.newExperience;
    if (!ne) return null;

    if (!ne.pageMarker.compiled.test(html)) return null;

    const rows = NewExperienceGitHubHTMLParser.extractBalancedLiBlocks(
      html,
      ne.rowSelector.compiled,
    );

    const prs: PullRequest[] = [];
    for (const row of rows) {
      try {
        const pr = NewExperienceGitHubHTMLParser.extractPRData(row, baseURL, ne);
        if (pr) prs.push(pr);
      } catch {
        // Skip rows that fail to parse — one malformed row should not
        // prevent the rest of the list from being extracted.
      }
    }

    const advertised = NewExperienceGitHubHTMLParser.parseAdvertisedResultsCount(
      html,
      ne.resultsCount,
    );
    if (advertised !== null && advertised > 0 && prs.length === 0) {
      throw new ParserBreakageError('NewExperience row selectors broken');
    }

    prs.sort(
      (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime(),
    );

    return prs;
  }

  /**
   * Parses the integer from `patterns.newExperience.resultsCount` when the regex
   * matches. Returns `null` when there is no `results-count` signal in this HTML.
   */
  private static parseAdvertisedResultsCount(html: string, rc: CompiledPattern): number | null {
    const groupIdx = rc.captureGroups?.count;
    if (groupIdx === undefined) return null;
    const re = rc.compiled;
    const savedLast = re.lastIndex;
    re.lastIndex = 0;
    try {
      const m = re.exec(html);
      if (!m?.[groupIdx]) return null;
      const n = parseInt(m[groupIdx], 10);
      return Number.isFinite(n) ? n : null;
    } finally {
      re.lastIndex = savedLast;
    }
  }

  /**
   * Balanced tag extraction for `<li>` elements. Same algorithm as
   * `GitHubHTMLParser.extractBalancedDivBlocks` but tracking
   * `<li>` / `</li>` depth so the complete subtree of each PR row is
   * captured even when inner lists or nested `<li>` elements exist.
   */
  private static extractBalancedLiBlocks(html: string, openingPattern: RegExp): string[] {
    const blocks: string[] = [];
    openingPattern.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = openingPattern.exec(html)) !== null) {
      const start = m.index;
      let i = m.index + m[0].length;
      let depth = 1;

      while (i < html.length && depth > 0) {
        const tail = html.slice(i);
        const openMatch = tail.match(/<li\b/i);
        const closeMatch = tail.match(/<\/li>/i);
        const openIdx = openMatch?.index ?? -1;
        const closeIdx = closeMatch?.index ?? -1;

        if (closeIdx === -1) break;

        if (openIdx !== -1 && openIdx < closeIdx) {
          depth++;
          const tagStart = i + openIdx;
          const gt = html.indexOf('>', tagStart);
          i = gt === -1 ? i + openIdx + 3 : gt + 1;
        } else {
          depth--;
          i = i + closeIdx + 5; // '</li>'.length === 5
        }
      }

      if (depth === 0) {
        blocks.push(html.slice(start, i));
      }
    }

    return blocks;
  }

  /**
   * Extracts structured PR data from a single balanced `<li>` block.
   * Mirrors the field-mapping contract of `GitHubHTMLParser.extractPRData`
   * but uses the `newExperience` pattern set exclusively.
   */
  private static extractPRData(
    rowHtml: string,
    baseURL: string,
    ne: CompiledNewExperiencePatterns,
  ): PullRequest | null {
    // ── URL + Title ──────────────────────────────────────────────────
    const titleMatch = rowHtml.match(ne.titleLink.compiled);
    if (!titleMatch) return null;

    const g = ne.titleLink.captureGroups!;
    const rawUrl = titleMatch[g.url];
    const titleHtml = titleMatch[g.titleHtml];
    if (!rawUrl || !titleHtml) return null;

    const url = rawUrl.startsWith('http') ? rawUrl : `${baseURL}${rawUrl}`;
    const title = NewExperienceGitHubHTMLParser.stripHtmlTags(titleHtml);
    if (!title) return null;

    // ── PR Number (from URL) ─────────────────────────────────────────
    const numMatch = rawUrl.match(ne.prNumber.compiled);
    const number = numMatch
      ? parseInt(numMatch[ne.prNumber.captureGroups!.number], 10)
      : null;

    // ── Repository Name (from URL) ───────────────────────────────────
    const repoMatch = rawUrl.match(ne.repoName.compiled);
    const repoName = repoMatch
      ? repoMatch[ne.repoName.captureGroups!.repoName]
      : 'Unknown Repo';

    // ── Author ───────────────────────────────────────────────────────
    // WHY [login / loginAlt]: newExperience.author uses one alternation regex (filter button vs
    // plain text); same coalescing contract as GitHubHTMLParser.extractPRData for remote config.
    const authorMatch = rowHtml.match(ne.author.compiled);
    const ag = ne.author.captureGroups!;
    const authorLoginRaw =
      authorMatch?.[ag.login]?.trim() ||
      (ag.loginAlt ? authorMatch?.[ag.loginAlt]?.trim() : undefined);
    const authorLogin = authorLoginRaw || 'Unknown Author';

    // ── Timestamp ────────────────────────────────────────────────────
    let createdAt = new Date().toISOString();
    for (const p of ne.timestamp) {
      const match = rowHtml.match(p.compiled);
      if (match?.[p.captureGroups!.datetime]) {
        createdAt = match[p.captureGroups!.datetime];
        break;
      }
    }

    // ── PR Type ──────────────────────────────────────────────────────
    const prType = NewExperienceGitHubHTMLParser.detectPRType(rowHtml, ne.prType);

    return {
      id: url,
      url,
      title,
      number,
      repoName,
      author: [{ login: authorLogin }],
      createdAt,
      type: prType,
      isNew: false,
    };
  }

  /**
   * Removes all HTML tags and collapses whitespace to recover plain text
   * from an innerHTML fragment (e.g. the nested `<span>` wrappers inside
   * the title link).
   */
  private static stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
  }

  /** Ordered first-match type detection — mirrors `GitHubHTMLParser.detectPRType`. */
  private static detectPRType(
    html: string,
    prType: CompiledPatternTypeEntry[],
  ): 'draft' | 'open' | 'merged' {
    for (const entry of prType) {
      if (entry.compiled.test(html)) return entry.type;
    }
    return 'open';
  }
}

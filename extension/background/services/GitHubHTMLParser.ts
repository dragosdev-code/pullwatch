import type { PullRequest, PullRequestAuthor } from '@common/types';
import type { CompiledPatterns } from '@common/pattern-types';
import { ParserBreakageError } from '@common/errors';
import {
  extractIsoTimestampFromPatterns,
  sortPullRequestsByEventTime,
} from '@common/pull-request-timestamp';
import {
  detectPRTypeFromEntries,
  extractBalancedBlocks,
  stripHtmlTags,
} from '@background/utils/github-parser-utils';

/**
 * Pure static utility for parsing GitHub PR listing pages.
 * All regex patterns are injected via {@link CompiledPatterns} — the parser
 * itself contains zero hardcoded selectors.
 */
export class GitHubHTMLParser {
  /**
   * Returns `true` when the HTML looks like a valid GitHub search-results
   * page — even if that page contains zero results (e.g. the user genuinely
   * has no PRs). Checks for structural markers that GitHub renders on every
   * search/pulls listing regardless of result count.
   */
  private static isRecognizedGitHubPage(html: string, patterns: CompiledPatterns): boolean {
    const p = patterns.pageRecognition;
    if (p.hasPRContent.compiled.test(html)) return true;
    if (p.knownSelectors.compiled.test(html)) return true;
    if (p.emptyState.compiled.test(html)) return true;
    if (p.noResults.compiled.test(html)) return true;
    return false;
  }

  /**
   * Parses a GitHub search-results HTML page and returns an array of PRs.
   * @param html      Raw HTML string from a GitHub PR listing page.
   * @param baseURL   GitHub base URL used to make relative PR links absolute.
   * @param patterns  Compiled pattern set driving all extraction logic.
   * @throws {ParserBreakageError} when the HTML is not recognizable as a
   *         GitHub page at all (likely a redesign or an unexpected error page).
   */
  static parseFromHTML(html: string, baseURL: string, patterns: CompiledPatterns): PullRequest[] {
    if (!patterns.pageRecognition.hasPRContent.compiled.test(html)) {
      if (GitHubHTMLParser.isRecognizedGitHubPage(html, patterns)) {
        return [];
      }
      throw new ParserBreakageError('parseFromHTML');
    }

    const prs: PullRequest[] = [];
    let prElements: RegExpMatchArray[] = [];

    // ── Try each PR row selector in priority order ───────────────────
    for (const selector of patterns.prRowSelectors) {
      if (selector.type === 'balanced-div') {
        const blocks = extractBalancedBlocks(html, selector.compiled, 'div');
        if (blocks.length > 0) {
          prElements = blocks.map((block) => {
            const synthetic = [block] as unknown as RegExpMatchArray;
            synthetic.index = 0;
            return synthetic;
          });
          break;
        }
        continue;
      }

      const matches = [...html.matchAll(selector.compiled)];
      if (matches.length > 0) {
        prElements = matches;
        break;
      }
    }

    // ── Fallback: scan for PR links, then extract their containers ───
    if (prElements.length === 0) {
      const allLinks = [...html.matchAll(patterns.prRowFallback.linkScan.compiled)];
      if (allLinks.length > 0) {
        prElements = [...html.matchAll(patterns.prRowFallback.containerExtract.compiled)];
      }
    }

    for (const element of prElements) {
      try {
        const pr = GitHubHTMLParser.extractPRData(element, baseURL, patterns);
        if (pr) prs.push(pr);
      } catch {
        // Skip elements that fail to parse
      }
    }

    return sortPullRequestsByEventTime(prs);
  }

  /**
   * Extracts structured PR data from a single regex-matched HTML element.
   */
  static extractPRData(
    element: RegExpMatchArray,
    baseURL: string,
    patterns: CompiledPatterns
  ): PullRequest | null {
    const elementHtml = element[0];

    // ── URL + Title ──────────────────────────────────────────────────
    let prUrl = '';
    let title = '';

    for (const p of patterns.prLink) {
      const match = elementHtml.match(p.compiled);
      const g = p.captureGroups!;
      if (match?.[g.url] && match[g.title]) {
        prUrl = match[g.url];
        title = stripHtmlTags(match[g.title]);
        break;
      }
    }

    if (!prUrl || !title) return null;

    const url = prUrl.startsWith('http') ? prUrl : `${baseURL}${prUrl}`;

    // ── PR Number ────────────────────────────────────────────────────
    const numUrl = patterns.prNumber.fromUrl;
    const numberMatch = prUrl.match(numUrl.compiled);
    let number = numberMatch ? parseInt(numberMatch[numUrl.captureGroups!.number], 10) : null;
    if (number === null) {
      const numEl = patterns.prNumber.fromElement;
      const spanMatch = elementHtml.match(numEl.compiled);
      if (spanMatch) number = parseInt(spanMatch[numEl.captureGroups!.number], 10);
    }

    // ── Repository Name ──────────────────────────────────────────────
    const repoP = patterns.repoName;
    const repoNameMatch = prUrl.match(repoP.compiled);
    const repoName = repoNameMatch ? repoNameMatch[repoP.captureGroups!.repoName] : 'Unknown Repo';

    // ── Author(s): assignee AvatarStack when present, else opener heuristics ──
    const fromStack = GitHubHTMLParser.extractAssigneesFromAvatarStack(elementHtml, patterns);
    let author: PullRequestAuthor[];

    if (fromStack && fromStack.length > 0) {
      author = fromStack;
    } else {
      let authorLogin = 'Unknown Author';
      for (const p of patterns.author) {
        const match = elementHtml.match(p.compiled);
        const g = p.captureGroups!;
        const login = match?.[g.login] || (g.loginAlt ? match?.[g.loginAlt] : undefined);
        if (login) {
          authorLogin = login.trim();
          break;
        }
      }
      author = [{ login: authorLogin }];
    }

    // WHY [DOM contract]: GitHub's row timestamp is frontend markup, not an API. Keep failures
    // scoped to this row so a missing `<relative-time datetime>` cannot crash the alarm wave.
    const timestamp = extractIsoTimestampFromPatterns(elementHtml, patterns.timestamp);

    // ── PR Type (draft / open / merged) ──────────────────────────────
    const prType = detectPRTypeFromEntries(elementHtml, patterns.prType);

    return {
      id: url,
      url,
      title,
      number,
      repoName,
      author,
      createdAt: timestamp.createdAt,
      eventAt: timestamp.eventAt,
      eventAtKind: 'unknown',
      timestampParseFailed: timestamp.timestampParseFailed,
      type: prType,
      isNew: false,
    };
  }

  /**
   * Parses GitHub assignee avatar stacks ("Assigned to …") inside a PR row.
   */
  static extractAssigneesFromAvatarStack(
    elementHtml: string,
    patterns: CompiledPatterns
  ): PullRequestAuthor[] | null {
    const av = patterns.assigneeAvatar;
    const openTag = elementHtml.match(av.stackContainer.compiled);
    if (!openTag || openTag.index === undefined) return null;

    const afterOpen = elementHtml.slice(openTag.index + openTag[0].length);
    const closeIdx = afterOpen.search(av.closeTag.compiled);
    if (closeIdx === -1) return null;

    const inner = afterOpen.slice(0, closeIdx);
    const authors: PullRequestAuthor[] = [];
    const seen = new Set<string>();

    for (const m of inner.matchAll(av.anchorSelector.compiled)) {
      const parsed = GitHubHTMLParser.parseAssigneeAnchor(m[0], patterns);
      if (!parsed) continue;
      const key = parsed.login.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      authors.push(parsed);
    }

    return authors.length > 0 ? authors : null;
  }

  private static parseAssigneeAnchor(
    anchorHtml: string,
    patterns: CompiledPatterns
  ): PullRequestAuthor | null {
    const av = patterns.assigneeAvatar;
    let login = '';

    const hrefMatch = anchorHtml.match(av.hrefExtract.compiled);
    if (hrefMatch?.[av.hrefExtract.captureGroups!.href]) {
      const href = hrefMatch[av.hrefExtract.captureGroups!.href];
      const encoded = href.match(av.loginFromHrefEncoded.compiled);
      const plain = href.match(av.loginFromHrefPlain.compiled);
      const raw =
        encoded?.[av.loginFromHrefEncoded.captureGroups!.login] ??
        plain?.[av.loginFromHrefPlain.captureGroups!.login];
      if (raw) {
        try {
          login = decodeURIComponent(raw).trim();
        } catch {
          login = raw.trim();
        }
      }
    }

    if (!login) {
      const altMatch = anchorHtml.match(av.loginFromAlt.compiled);
      if (altMatch?.[av.loginFromAlt.captureGroups!.login]) {
        login = altMatch[av.loginFromAlt.captureGroups!.login].trim();
      }
    }

    if (!login) {
      const ariaMatch = anchorHtml.match(av.loginFromAria.compiled);
      if (ariaMatch?.[av.loginFromAria.captureGroups!.login]) {
        login = ariaMatch[av.loginFromAria.captureGroups!.login].trim();
      }
    }

    if (!login) return null;

    const imgMatch = anchorHtml.match(av.avatarImg.compiled);
    const avatarUrl = imgMatch?.[av.avatarImg.captureGroups!.src]?.replace(/&amp;/g, '&');

    return avatarUrl ? { login, avatarUrl } : { login };
  }
}

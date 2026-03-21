import type { PullRequest } from '../../common/types';

/**
 * Pure static utility for parsing GitHub PR listing pages via regex.
 * No dependencies, no state, no lifecycle -- easy to unit test.
 */
export class GitHubHTMLParser {
  /**
   * Parses a GitHub search-results HTML page and returns an array of PRs.
   * @param html  Raw HTML string from a GitHub PR listing page.
   * @param baseURL  GitHub base URL used to make relative PR links absolute.
   */
  static parseFromHTML(html: string, baseURL: string): PullRequest[] {
    const prs: PullRequest[] = [];

    const prSelectors = [
      'js-issue-row',
      'Box-row',
      'issue-list-item',
      'data-hovercard-type="pull_request"',
    ];

    let prElements: RegExpMatchArray[] = [];

    for (const selector of prSelectors) {
      let pattern: RegExp;
      if (selector === 'data-hovercard-type="pull_request"') {
        pattern = new RegExp(`<[^>]*${selector}[^>]*>(.*?)</[^>]*>`, 'gis');
      } else if (selector === 'js-issue-row') {
        pattern = new RegExp(
          `<div[^>]*class="[^"]*${selector}[^"]*"[^>]*>.*?</div>(?=\\s*(?:<div[^>]*class="[^"]*${selector}|</div>|$))`,
          'gis'
        );
      } else {
        pattern = new RegExp(`<[^>]*class="[^"]*${selector}[^"]*"[^>]*>(.*?)</[^>]*>`, 'gis');
      }

      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        prElements = matches;
        break;
      }
    }

    if (prElements.length === 0) {
      const prLinkPattern = /<a[^>]*href="[^"]*\/pull\/\d+[^"]*"[^>]*>([^<]*)<\/a>/gi;
      const allLinks = [...html.matchAll(prLinkPattern)];

      if (allLinks.length > 0) {
        const containerPattern =
          /<(?:div|article|li|tr)[^>]*>.*?<a[^>]*href="([^"]*\/pull\/\d+)[^"]*"[^>]*>([^<]*)<\/a>.*?<\/(?:div|article|li|tr)>/gi;
        prElements = [...html.matchAll(containerPattern)];
      }
    }

    for (const element of prElements) {
      try {
        const pr = GitHubHTMLParser.extractPRData(element, baseURL);
        if (pr) prs.push(pr);
      } catch {
        // Skip elements that fail to parse
      }
    }

    prs.sort(
      (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
    );
    return prs;
  }

  /**
   * Extracts structured PR data from a single regex-matched HTML element.
   */
  static extractPRData(element: RegExpMatchArray, baseURL: string): PullRequest | null {
    const elementHtml = element[0];

    // ── URL + Title ──────────────────────────────────────────────────
    let prUrl = '';
    let title = '';

    const prLinkPatterns = [
      /<a[^>]*href="([^"]*\/pull\/\d+)"[^>]*class="[^"]*(?:markdown-title|js-navigation-open|Link--primary)[^"]*"[^>]*>([^<]+)<\/a>/i,
      /<a[^>]*href="([^"]*\/pull\/\d+)"[^>]*>([^<]+)<\/a>/i,
      /<a[^>]*class="[^"]*(?:markdown-title|js-navigation-open|Link--primary)[^"]*"[^>]*href="([^"]*\/pull\/\d+)"[^>]*>([^<]+)<\/a>/i,
    ];

    for (const pattern of prLinkPatterns) {
      const match = elementHtml.match(pattern);
      if (match?.[1] && match[2]) {
        prUrl = match[1];
        title = match[2].trim().replace(/\s+/g, ' ');
        break;
      }
    }

    if (!prUrl || !title) return null;

    const url = prUrl.startsWith('http') ? prUrl : `${baseURL}${prUrl}`;

    // ── PR Number ────────────────────────────────────────────────────
    const numberMatch = prUrl.match(/\/pull\/(\d+)/);
    let number = numberMatch ? parseInt(numberMatch[1], 10) : null;
    if (number === null) {
      const spanMatch = elementHtml.match(/#(\d+)\s+opened/);
      if (spanMatch) number = parseInt(spanMatch[1], 10);
    }

    // ── Repository Name ──────────────────────────────────────────────
    const repoNameMatch = prUrl.match(/\/([^/]+\/[^/]+)\/pull/);
    const repoName = repoNameMatch ? repoNameMatch[1] : 'Unknown Repo';

    // ── Author ───────────────────────────────────────────────────────
    let authorLogin = 'Unknown Author';
    const authorPatterns = [
      /<a[^>]*href="[^"]*\/([^"/?]+)"[^>]*title="[^"]*"[^>]*>([^<]+)<\/a>/i,
      /<a[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/a>/i,
      /<a[^>]*data-hovercard-type="user"[^>]*data-hovercard-url="[^"]*\/users\/([^"/]+)\/[^"]*"[^>]*>/i,
      /opened[^<]*by[^<]*<a[^>]*>([^<]+)<\/a>/i,
    ];

    for (const pattern of authorPatterns) {
      const match = elementHtml.match(pattern);
      if (match?.[1] || match?.[2]) {
        authorLogin = (match[1] || match[2]).trim();
        break;
      }
    }

    // ── Creation Time ────────────────────────────────────────────────
    let createdAt = new Date().toISOString();
    const timePatterns = [
      /<relative-time[^>]+datetime="([^"]+)"/i,
      /<time[^>]+datetime="([^"]+)"/i,
      /datetime="([^"]+)"/i,
    ];

    for (const pattern of timePatterns) {
      const match = elementHtml.match(pattern);
      if (match?.[1]) {
        createdAt = match[1];
        break;
      }
    }

    // ── PR Type (draft / open / merged) ──────────────────────────────
    const prType = GitHubHTMLParser.detectPRType(elementHtml);

    return {
      id: url,
      url,
      title,
      number,
      repoName,
      author: { login: authorLogin },
      createdAt,
      type: prType,
      isNew: false,
    };
  }

  private static detectPRType(html: string): 'draft' | 'open' | 'merged' {
    // Primary: aria-label based detection
    if (/aria-label="[^"]*Draft Pull Request[^"]*"/i.test(html)) return 'draft';
    if (/aria-label="[^"]*Open Pull Request[^"]*"/i.test(html)) return 'open';
    if (/aria-label="[^"]*Merged Pull Request[^"]*"/i.test(html)) return 'merged';

    // Fallback: SVG class names or textual badges
    if (
      /octicon-git-pull-request-draft/i.test(html) ||
      /(^|[^a-z])Draft([^a-z]|$)/i.test(html)
    ) {
      return 'draft';
    }
    if (/octicon-git-pull-request(?!-)/i.test(html) || /color-fg-open/i.test(html)) {
      return 'open';
    }
    if (/octicon-git-merge/i.test(html)) return 'merged';

    return 'open';
  }
}

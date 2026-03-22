import type { PullRequest, PullRequestAuthor } from '../../common/types';

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
        const blocks = GitHubHTMLParser.extractJsIssueRowBlocks(html);
        if (blocks.length > 0) {
          prElements = blocks.map((block) => {
            const synthetic = [block] as unknown as RegExpMatchArray;
            synthetic.index = 0;
            return synthetic;
          });
          break;
        }
        continue;
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

    // ── Author(s): assignee AvatarStack when present, else opener heuristics ──
    const fromStack = GitHubHTMLParser.extractAssigneesFromAvatarStack(elementHtml);
    let author: PullRequestAuthor[];

    if (fromStack && fromStack.length > 0) {
      author = fromStack;
    } else {
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
      author = [{ login: authorLogin }];
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
      author,
      createdAt,
      type: prType,
      isNew: false,
    };
  }

  /**
   * Returns full HTML for each `js-issue-row` root by balancing nested &lt;div&gt; tags.
   * A naive `.*?</div>` match stops at the first inner close tag and drops assignee AvatarStack markup.
   */
  private static extractJsIssueRowBlocks(html: string): string[] {
    const blocks: string[] = [];
    const openRe = /<div\b[^>]*\bclass="[^"]*\bjs-issue-row\b[^"]*"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(html)) !== null) {
      const start = m.index;
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < html.length && depth > 0) {
        const tail = html.slice(i);
        const openMatch = tail.match(/<div\b/i);
        const closeMatch = tail.match(/<\/div>/i);
        const openIdx = openMatch?.index ?? -1;
        const closeIdx = closeMatch?.index ?? -1;
        if (closeIdx === -1) break;
        if (openIdx !== -1 && openIdx < closeIdx) {
          depth++;
          const tagStart = i + openIdx;
          const gt = html.indexOf('>', tagStart);
          i = gt === -1 ? i + openIdx + 4 : gt + 1;
        } else {
          depth--;
          i = i + closeIdx + 6;
        }
      }
      if (depth === 0) {
        blocks.push(html.slice(start, i));
      }
    }
    return blocks;
  }

  /**
   * Parses GitHub assignee avatar stacks (“Assigned to …”) inside a PR row.
   */
  static extractAssigneesFromAvatarStack(elementHtml: string): PullRequestAuthor[] | null {
    const openTag = elementHtml.match(
      /<div\b(?=[^>]*\bclass="[^"]*\bAvatarStack-body\b[^"]*")(?=[^>]*\baria-label="Assigned to[^"]*")[^>]*>/i
    );
    if (!openTag || openTag.index === undefined) return null;

    const afterOpen = elementHtml.slice(openTag.index + openTag[0].length);
    const closeIdx = afterOpen.search(/<\/div>/i);
    if (closeIdx === -1) return null;

    const inner = afterOpen.slice(0, closeIdx);
    const anchorRe = /<a\b[^>]*class="[^"]*\bavatar-user\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
    const authors: PullRequestAuthor[] = [];
    const seen = new Set<string>();

    for (const m of inner.matchAll(anchorRe)) {
      const parsed = GitHubHTMLParser.parseAssigneeAnchor(m[0]);
      if (!parsed) continue;
      const key = parsed.login.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      authors.push(parsed);
    }

    return authors.length > 0 ? authors : null;
  }

  private static parseAssigneeAnchor(anchorHtml: string): PullRequestAuthor | null {
    let login = '';

    const hrefMatch = anchorHtml.match(/\bhref="([^"]+)"/i);
    if (hrefMatch?.[1]) {
      const href = hrefMatch[1];
      const encoded = href.match(/assignee%3A([^&"+]+)/i);
      const plain = href.match(/assignee:([^&"+]+)/i);
      const raw = encoded?.[1] ?? plain?.[1];
      if (raw) {
        try {
          login = decodeURIComponent(raw).trim();
        } catch {
          login = raw.trim();
        }
      }
    }

    if (!login) {
      const altMatch = anchorHtml.match(/\balt="@([^"]+)"/i);
      if (altMatch?.[1]) login = altMatch[1].trim();
    }

    if (!login) {
      const ariaMatch = anchorHtml.match(
        /\baria-label="([^"]+?)(?:'|&#39;|\u2019)s assigned issues"/i
      );
      if (ariaMatch?.[1]) login = ariaMatch[1].trim();
    }

    if (!login) return null;

    const imgMatch = anchorHtml.match(
      /<img[^>]*class="[^"]*\bfrom-avatar\b[^"]*"[^>]*\bsrc="([^"]+)"/i
    );
    const avatarUrl = imgMatch?.[1]?.replace(/&amp;/g, '&');

    return avatarUrl ? { login, avatarUrl } : { login };
  }

  private static detectPRType(html: string): 'draft' | 'open' | 'merged' {
    // Primary: aria-label based detection
    if (/aria-label="[^"]*Draft Pull Request[^"]*"/i.test(html)) return 'draft';
    if (/aria-label="[^"]*Open Pull Request[^"]*"/i.test(html)) return 'open';
    if (/aria-label="[^"]*Merged Pull Request[^"]*"/i.test(html)) return 'merged';

    // Fallback: SVG class names or textual badges
    if (/octicon-git-pull-request-draft/i.test(html) || /(^|[^a-z])Draft([^a-z]|$)/i.test(html)) {
      return 'draft';
    }
    if (/octicon-git-pull-request(?!-)/i.test(html) || /color-fg-open/i.test(html)) {
      return 'open';
    }
    if (/octicon-git-merge/i.test(html)) return 'merged';

    return 'open';
  }
}

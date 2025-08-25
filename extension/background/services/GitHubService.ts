import type { IGitHubService } from '../interfaces/IGitHubService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { PullRequest } from '../../common/types';
import {
  GITHUB_BASE_URL,
  GITHUB_REVIEW_REQUESTS_URL_TEMPLATE,
  USER_AGENT,
} from '../../common/constants';

/**
 * GitHubService handles GitHub API operations with enhanced error handling and state management.
 * Provides methods to fetch pull requests and manage GitHub authentication.
 */
export class GitHubService implements IGitHubService {
  private debugService: IDebugService;
  private storageService: IStorageService;
  private initialized = false;
  private baseURL: string;
  private reviewRequestsURL: string;

  constructor(debugService: IDebugService, storageService: IStorageService) {
    this.debugService = debugService;
    this.storageService = storageService;
    this.baseURL = GITHUB_BASE_URL;
    this.reviewRequestsURL = GITHUB_REVIEW_REQUESTS_URL_TEMPLATE(this.baseURL);
  }

  /**
   * Initializes the GitHub service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.debugService.log(
      '[GitHubService] Initialized. Review requests URL:',
      this.reviewRequestsURL
    );
    this.initialized = true;
    this.debugService.log('[GitHubService] GitHub service initialized');
  }

  /**
   * Fetches assigned pull requests from GitHub.
   */
  async fetchAssignedPRs(): Promise<PullRequest[]> {
    this.debugService.log(
      '[GitHubService] Attempting to fetch assigned PRs from:',
      this.reviewRequestsURL
    );
    try {
      const response = await fetch(this.reviewRequestsURL, {
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': USER_AGENT,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      this.debugService.log(
        '[GitHubService] Fetch response status:',
        response.status,
        response.statusText
      );
      this.debugService.log('[GitHubService] Fetch response URL:', response.url);
      this.debugService.log(
        '[GitHubService] Fetch response headers:',
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        this.debugService.error(
          `[GitHubService] GitHub request failed: ${response.status} ${response.statusText}`
        );
        if (response.status === 401 || response.status === 403) {
          const errorMsg =
            'AuthenticationError: Not logged in or insufficient permissions on GitHub.';
          this.debugService.error(`[GitHubService] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        const errorMsg = `GitHub request failed: ${response.status}`;
        this.debugService.error(`[GitHubService] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const html = await response.text();
      this.debugService.log('[GitHubService] HTML received. Length:', html.length);
      if (html.length < 500) {
        this.debugService.log('[GitHubService] Short HTML response content:', html);
      }

      const pageTitle = (html.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
      this.debugService.log('[GitHubService] Page title:', pageTitle);

      const isLoginPage =
        pageTitle.includes('Sign in to GitHub') ||
        html.includes('name="login"') ||
        response.url.includes('/login') ||
        html.includes('action="/session"') ||
        html.includes('class="auth-form"');

      if (isLoginPage) {
        this.debugService.warn(
          '[GitHubService] Detected GitHub login page. User is likely not logged in.'
        );
        throw new Error('NotLoggedIn: User is not logged in to GitHub.');
      }

      if (
        !html.includes('js-issue-row') &&
        !html.includes('pull request') &&
        !html.includes("You don't have any pull requests to review")
      ) {
        this.debugService.warn(
          "[GitHubService] The fetched HTML doesn't look like a PR listing page. Content might be unexpected."
        );
      }

      return this.parseAssignedPRsFromHTML(html);
    } catch (error: unknown) {
      this.debugService.error(
        '[GitHubService] Error in fetchAssignedPRs:',
        error instanceof Error ? error.message : error
      );
      if (
        error instanceof Error &&
        (error.message.startsWith('AuthenticationError') || error.message.startsWith('NotLoggedIn'))
      ) {
        throw error;
      }
      throw new Error(
        `Network or parsing error while fetching PRs: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Regex-based HTML parser for GitHub PR pages.
   */
  private parseAssignedPRsFromHTML(html: string): PullRequest[] {
    this.debugService.log(
      '[GitHubService-RegexParser] Starting to parse HTML. Length:',
      html.length
    );
    const prs: PullRequest[] = [];

    // Debug: Check what we actually received
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    this.debugService.log(
      '[GitHubService-RegexParser] Page title:',
      titleMatch?.[1] || 'No title found'
    );

    // Selectors for GitHub search results page (adapted for regex)
    const prSelectors = [
      // GitHub search results selectors
      'js-issue-row', // Main search result row
      'Box-row', // Generic box row
      'issue-list-item', // Issue list item
      'data-hovercard-type="pull_request"', // PR-specific
    ];

    let prElements: RegExpMatchArray[] = [];

    // Try to find PR containers using various patterns
    for (const selector of prSelectors) {
      let pattern: RegExp;
      if (selector === 'data-hovercard-type="pull_request"') {
        // Special case for hovercard attribute
        pattern = new RegExp(`<[^>]*${selector}[^>]*>(.*?)</[^>]*>`, 'gis');
      } else {
        // Regular class-based selectors - improved to capture full container
        if (selector === 'js-issue-row') {
          // For js-issue-row, match the full div container with proper nesting
          pattern = new RegExp(
            `<div[^>]*class="[^"]*${selector}[^"]*"[^>]*>.*?</div>(?=\\s*(?:<div[^>]*class="[^"]*${selector}|</div>|$))`,
            'gis'
          );
        } else {
          pattern = new RegExp(`<[^>]*class="[^"]*${selector}[^"]*"[^>]*>(.*?)</[^>]*>`, 'gis');
        }
      }

      const matches = [...html.matchAll(pattern)];
      this.debugService.log(
        `[GitHubService-RegexParser] Selector "${selector}" found ${matches.length} elements`
      );

      if (matches.length > 0) {
        prElements = matches;
        this.debugService.log(
          `[GitHubService-RegexParser] Using selector "${selector}" with ${matches.length} matches`
        );
        break;
      }
    }

    // If no specific PR selectors work, try to find any links to PRs
    if (prElements.length === 0) {
      this.debugService.log(
        '[GitHubService-RegexParser] No PR containers found, looking for PR links...'
      );
      const prLinkPattern = /<a[^>]*href="[^"]*\/pull\/\d+[^"]*"[^>]*>([^<]*)<\/a>/gi;
      const allLinks = [...html.matchAll(prLinkPattern)];
      this.debugService.log(
        `[GitHubService-RegexParser] Found ${allLinks.length} PR links in total`
      );

      // Group links by finding their containing elements
      const containerPattern =
        /<(?:div|article|li|tr)[^>]*>.*?<a[^>]*href="([^"]*\/pull\/\d+)[^"]*"[^>]*>([^<]*)<\/a>.*?<\/(?:div|article|li|tr)>/gi;
      prElements = [...html.matchAll(containerPattern)];
      this.debugService.log(
        `[GitHubService-RegexParser] Extracted ${prElements.length} unique PR containers`
      );
    }

    this.debugService.log(
      `[GitHubService-RegexParser] Total PR containers to process: ${prElements.length}`
    );
    let successfullyParsed = 0;
    let failedToParse = 0;

    prElements.forEach((element, index) => {
      try {
        this.debugService.log(
          `[GitHubService-RegexParser] Processing element ${index + 1}/${prElements.length}`
        );
        const pr = this.extractPRDataFromElement(element);
        if (pr) {
          this.debugService.log(
            `[GitHubService-RegexParser] ✅ Successfully extracted PR: ${pr.title}`
          );
          prs.push(pr);
          successfullyParsed++;
        } else {
          this.debugService.log(
            `[GitHubService-RegexParser] ❌ Failed to extract PR data from element ${index + 1}`
          );
          failedToParse++;
        }
      } catch (error) {
        this.debugService.error(
          `[GitHubService-RegexParser] ❌ Error parsing PR element ${index + 1}:`,
          error
        );
        failedToParse++;
      }
    });

    this.debugService.log(`[GitHubService-RegexParser] PARSING SUMMARY:`);
    this.debugService.log(`[GitHubService-RegexParser] - Containers found: ${prElements.length}`);
    this.debugService.log(
      `[GitHubService-RegexParser] - Successfully parsed: ${successfullyParsed}`
    );
    this.debugService.log(`[GitHubService-RegexParser] - Failed to parse: ${failedToParse}`);
    this.debugService.log(`[GitHubService-RegexParser] - Final PR count: ${prs.length}`);

    if (prElements.length === 0 && html.includes('js-issue-row')) {
      this.debugService.warn(
        "[GitHubService-RegexParser] Found 'js-issue-row' in HTML, but no PR containers found with any selector."
      );
    }

    if (prs.length === 0 && !html.includes("You don't have any pull requests to review")) {
      this.debugService.warn(
        '[GitHubService-RegexParser] No PRs parsed. This could be due to: no assigned PRs, user not logged in, unexpected page structure, or regex patterns needing update.'
      );
    }

    this.debugService.log(`[GitHubService-RegexParser] Total PRs extracted: ${prs.length}`);
    prs.sort(
      (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
    );
    return prs;
  }

  /**
   * Extracts PR data from a single HTML element.
   */
  private extractPRDataFromElement(element: RegExpMatchArray): PullRequest | null {
    try {
      // The element[0] contains the full matched content
      const elementHtml = element[0];

      this.debugService.log(
        '[GitHubService-RegexParser] ==================== ELEMENT EXTRACTION START ===================='
      );
      this.debugService.log('[GitHubService-RegexParser] Element HTML length:', elementHtml.length);
      this.debugService.log(
        '[GitHubService-RegexParser] Element HTML sample (first 500 chars):',
        elementHtml.substring(0, 500)
      );

      // Extract PR URL and title with multiple patterns
      let prUrl = '';
      let title = '';

      // Pattern 1: Look for PR links with various class patterns
      const prLinkPatterns = [
        /<a[^>]*href="([^"]*\/pull\/\d+)"[^>]*class="[^"]*(?:markdown-title|js-navigation-open|Link--primary)[^"]*"[^>]*>([^<]+)<\/a>/i,
        /<a[^>]*href="([^"]*\/pull\/\d+)"[^>]*>([^<]+)<\/a>/i,
        /<a[^>]*class="[^"]*(?:markdown-title|js-navigation-open|Link--primary)[^"]*"[^>]*href="([^"]*\/pull\/\d+)"[^>]*>([^<]+)<\/a>/i,
      ];

      this.debugService.log('[GitHubService-RegexParser] Trying to extract PR URL and title...');
      for (let i = 0; i < prLinkPatterns.length; i++) {
        const pattern = prLinkPatterns[i];
        const match = elementHtml.match(pattern);
        this.debugService.log(
          `[GitHubService-RegexParser] Pattern ${i + 1} result:`,
          match ? `Found: ${match[1]} | ${match[2]}` : 'No match'
        );
        if (match && match[1] && match[2]) {
          prUrl = match[1];
          title = match[2].trim().replace(/\s+/g, ' ');
          this.debugService.log(
            `[GitHubService-RegexParser] ✅ Found PR link with pattern ${i + 1}:`,
            prUrl,
            '|',
            title
          );
          break;
        }
      }

      if (!prUrl || !title) {
        this.debugService.warn(
          '[GitHubService-RegexParser] ❌ Could not extract PR URL and title from element'
        );
        this.debugService.log('[GitHubService-RegexParser] Looking for ANY links in element...');

        // Let's see what links exist in this element
        const allLinks = elementHtml.match(/<a[^>]*href="[^"]*"[^>]*>.*?<\/a>/gi);
        this.debugService.log(
          '[GitHubService-RegexParser] All links found in element:',
          allLinks?.length || 0
        );
        if (allLinks) {
          allLinks.slice(0, 3).forEach((link, idx) => {
            this.debugService.log(
              `[GitHubService-RegexParser] Link ${idx + 1}:`,
              link.substring(0, 200)
            );
          });
        }

        this.debugService.log(
          '[GitHubService-RegexParser] ==================== ELEMENT EXTRACTION FAILED ===================='
        );
        return null;
      }

      // Ensure URL is absolute
      const url = prUrl.startsWith('http') ? prUrl : `${this.baseURL}${prUrl}`;

      // Extract PR number
      const numberMatch = prUrl.match(/\/pull\/(\d+)/);
      const number = numberMatch ? parseInt(numberMatch[1], 10) : null;
      this.debugService.log('[GitHubService-RegexParser] PR number extracted:', number);

      // Extract repository name
      const repoNameMatch = prUrl.match(/\/([^/]+\/[^/]+)\/pull/);
      const repoName = repoNameMatch ? repoNameMatch[1] : 'Unknown Repo';
      this.debugService.log('[GitHubService-RegexParser] Repository name extracted:', repoName);

      // Extract author with multiple patterns
      let authorLogin = 'Unknown Author';
      const authorPatterns = [
        /<a[^>]*href="[^"]*\/([^"/?]+)"[^>]*title="[^"]*"[^>]*>([^<]+)<\/a>/i,
        /<a[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/a>/i,
        /<a[^>]*data-hovercard-type="user"[^>]*data-hovercard-url="[^"]*\/users\/([^"/]+)\/[^"]*"[^>]*>/i,
        /opened[^<]*by[^<]*<a[^>]*>([^<]+)<\/a>/i,
      ];

      this.debugService.log('[GitHubService-RegexParser] Trying to extract author...');
      for (let i = 0; i < authorPatterns.length; i++) {
        const pattern = authorPatterns[i];
        const match = elementHtml.match(pattern);
        this.debugService.log(
          `[GitHubService-RegexParser] Author pattern ${i + 1} result:`,
          match ? `Found: ${match[1] || match[2]}` : 'No match'
        );
        if (match && (match[1] || match[2])) {
          authorLogin = (match[1] || match[2]).trim();
          this.debugService.log(
            `[GitHubService-RegexParser] ✅ Found author with pattern ${i + 1}:`,
            authorLogin
          );
          break;
        }
      }

      // Extract creation time
      let createdAt = new Date().toISOString();
      const timePatterns = [
        /<relative-time[^>]+datetime="([^"]+)"/i,
        /<time[^>]+datetime="([^"]+)"/i,
        /datetime="([^"]+)"/i,
      ];

      this.debugService.log('[GitHubService-RegexParser] Trying to extract creation time...');
      for (let i = 0; i < timePatterns.length; i++) {
        const pattern = timePatterns[i];
        const match = elementHtml.match(pattern);
        this.debugService.log(
          `[GitHubService-RegexParser] Time pattern ${i + 1} result:`,
          match ? `Found: ${match[1]}` : 'No match'
        );
        if (match && match[1]) {
          createdAt = match[1];
          this.debugService.log(
            `[GitHubService-RegexParser] ✅ Found creation time with pattern ${i + 1}:`,
            createdAt
          );
          break;
        }
      }

      // Extract PR type (draft or open) using aria-label and fallbacks
      let prType: 'draft' | 'open' | 'merged' = 'open';
      if (/aria-label="[^"]*Draft Pull Request[^"]*"/i.test(elementHtml)) {
        prType = 'draft';
        this.debugService.log(
          '[GitHubService-RegexParser] PR type detected from aria-label: draft'
        );
      } else if (/aria-label="[^"]*Open Pull Request[^"]*"/i.test(elementHtml)) {
        prType = 'open';
        this.debugService.log('[GitHubService-RegexParser] PR type detected from aria-label: open');
      } else if (/aria-label="[^"]*Merged Pull Request[^"]*"/i.test(elementHtml)) {
        prType = 'merged';
        this.debugService.log(
          '[GitHubService-RegexParser] PR type detected from aria-label: merged'
        );
      } else {
        // Fallbacks: SVG class names or textual Draft badge
        if (
          /octicon-git-pull-request-draft/i.test(elementHtml) ||
          /(^|[^a-z])Draft([^a-z]|$)/i.test(elementHtml)
        ) {
          prType = 'draft';
          this.debugService.log(
            '[GitHubService-RegexParser] PR type inferred from SVG class or badge: draft'
          );
        } else if (
          /octicon-git-pull-request(?!-)/i.test(elementHtml) ||
          /color-fg-open/i.test(elementHtml)
        ) {
          prType = 'open';
          this.debugService.log(
            '[GitHubService-RegexParser] PR type inferred from SVG class: open'
          );
        } else if (/octicon-git-merge/i.test(elementHtml)) {
          prType = 'merged';
          this.debugService.log(
            '[GitHubService-RegexParser] PR type inferred from SVG class: merged'
          );
        } else {
          this.debugService.log(
            '[GitHubService-RegexParser] PR type not explicitly found; defaulting to open'
          );
        }
      }

      const pr: PullRequest = {
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

      this.debugService.log('[GitHubService-RegexParser] ✅ Successfully created PR object:', {
        id: pr.id,
        title: pr.title,
        number: pr.number,
        repoName: pr.repoName,
        author: pr.author.login,
        createdAt: pr.createdAt,
        type: pr.type,
      });
      this.debugService.log(
        '[GitHubService-RegexParser] ==================== ELEMENT EXTRACTION SUCCESS ===================='
      );

      return pr;
    } catch (error) {
      this.debugService.error(
        '[GitHubService-RegexParser] ❌ Error in extractPRDataFromElement:',
        error
      );
      this.debugService.log(
        '[GitHubService-RegexParser] ==================== ELEMENT EXTRACTION ERROR ===================='
      );
      return null;
    }
  }

  /**
   * Fetches pull requests by query.
   */
  async fetchPRsByQuery(query: string): Promise<PullRequest[]> {
    try {
      this.debugService.log(`[GitHubService] Fetching PRs by query: ${query}`);
      // This would be implemented based on your GitHub API needs
      // For now, return empty array as stub
      return [];
    } catch (error) {
      this.debugService.error('[GitHubService] Error fetching PRs by query:', error);
      throw error;
    }
  }

  /**
   * Gets user information from GitHub.
   */
  async getUserInfo(): Promise<{ login: string; name: string; avatar_url: string } | null> {
    try {
      this.debugService.log('[GitHubService] Getting user info...');
      // Stub implementation - would call GitHub API
      return null;
    } catch (error) {
      this.debugService.error('[GitHubService] Error getting user info:', error);
      return null;
    }
  }

  /**
   * Validates the GitHub token.
   */
  async validateToken(): Promise<boolean> {
    try {
      this.debugService.log('[GitHubService] Validating token...');
      // Stub implementation - would validate with GitHub API
      return true;
    } catch (error) {
      this.debugService.error('[GitHubService] Error validating token:', error);
      return false;
    }
  }

  /**
   * Sets the GitHub token.
   */
  async setToken(token: string): Promise<void> {
    try {
      await this.storageService.set('github_token', token);
      this.debugService.log('[GitHubService] GitHub token updated');
    } catch (error) {
      this.debugService.error('[GitHubService] Error setting token:', error);
      throw error;
    }
  }

  /**
   * Gets the current GitHub token.
   */
  async getToken(): Promise<string | null> {
    try {
      const token = await this.storageService.get<string>('github_token');
      this.debugService.log('[GitHubService] Retrieved GitHub token:', token ? '***' : 'null');
      return token;
    } catch (error) {
      this.debugService.error('[GitHubService] Error getting token:', error);
      return null;
    }
  }

  /**
   * Clears the GitHub token.
   */
  async clearToken(): Promise<void> {
    try {
      await this.storageService.remove('github_token');
      this.debugService.log('[GitHubService] GitHub token cleared');
    } catch (error) {
      this.debugService.error('[GitHubService] Error clearing token:', error);
      throw error;
    }
  }

  /**
   * Disposes the GitHub service.
   */
  async dispose(): Promise<void> {
    this.debugService.log('[GitHubService] GitHub service disposed');
    this.initialized = false;
  }
}

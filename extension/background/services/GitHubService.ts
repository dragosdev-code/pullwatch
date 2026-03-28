import type { IGitHubService } from '../interfaces/IGitHubService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IAvatarService } from '../interfaces/IAvatarService';
import type { PullRequest } from '../../common/types';
import {
  GITHUB_BASE_URL,
  GITHUB_REVIEW_REQUESTS_URL_TEMPLATE,
  GITHUB_MERGED_PRS_URL_TEMPLATE,
  GITHUB_REVIEWED_PRS_URL_TEMPLATE,
  GITHUB_AUTHORED_APPROVED_URL_TEMPLATE,
  GITHUB_AUTHORED_CHANGES_REQUESTED_URL_TEMPLATE,
  GITHUB_AUTHORED_PENDING_URL_TEMPLATE,
  GITHUB_AUTHORED_COMMENTED_URL_TEMPLATE,
  GITHUB_AUTHORED_DRAFT_URL_TEMPLATE,
  USER_AGENT,
  REQUEST_DELAY_MS,
  GITHUB_FETCH_TIMEOUT_MS,
} from '../../common/constants';
import { RateLimitError, ParserBreakageError } from '../../common/errors';
import { GitHubHTMLParser } from './GitHubHTMLParser';

/**
 * GitHubService handles GitHub HTTP operations for fetching pull requests.
 * Delegates HTML parsing to GitHubHTMLParser and avatar enrichment to AvatarService.
 */
export class GitHubService implements IGitHubService {
  private debugService: IDebugService;
  private avatarService: IAvatarService;
  private initialized = false;
  private baseURL: string;
  private reviewRequestsURL: string;
  private mergedPRsURL: string;
  private reviewedPRsURL: string;
  private authoredApprovedURL: string;
  private authoredChangesRequestedURL: string;
  private authoredPendingURL: string;
  private authoredCommentedURL: string;
  private authoredDraftURL: string;

  constructor(debugService: IDebugService, avatarService: IAvatarService) {
    this.debugService = debugService;
    this.avatarService = avatarService;
    this.baseURL = GITHUB_BASE_URL;
    this.reviewRequestsURL = GITHUB_REVIEW_REQUESTS_URL_TEMPLATE(this.baseURL);
    this.mergedPRsURL = GITHUB_MERGED_PRS_URL_TEMPLATE(this.baseURL);
    this.reviewedPRsURL = GITHUB_REVIEWED_PRS_URL_TEMPLATE(this.baseURL);
    this.authoredApprovedURL = GITHUB_AUTHORED_APPROVED_URL_TEMPLATE(this.baseURL);
    this.authoredChangesRequestedURL = GITHUB_AUTHORED_CHANGES_REQUESTED_URL_TEMPLATE(this.baseURL);
    this.authoredPendingURL = GITHUB_AUTHORED_PENDING_URL_TEMPLATE(this.baseURL);
    this.authoredCommentedURL = GITHUB_AUTHORED_COMMENTED_URL_TEMPLATE(this.baseURL);
    this.authoredDraftURL = GITHUB_AUTHORED_DRAFT_URL_TEMPLATE(this.baseURL);
  }

  private readonly githubFetchHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': USER_AGENT,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.debugService.log(
      '[GitHubService] Initialized. Review requests URL:',
      this.reviewRequestsURL
    );
    this.debugService.log('[GitHubService] Initialized. Reviewed PRs URL:', this.reviewedPRsURL);
    this.initialized = true;
    this.debugService.log('[GitHubService] GitHub service initialized');
  }

  /**
   * Shared GitHub fetch pipeline that retrieves and transforms HTML responses.
   * Uses an AbortController to guarantee the request settles within
   * {@link GITHUB_FETCH_TIMEOUT_MS}, preventing permanent deadlocks in
   * PRService's deduplication locks when GitHub hangs.
   */
  private async fetchGitHubData<T>(
    url: string,
    context: string,
    transform: (html: string) => T | Promise<T>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: this.githubFetchHeaders,
        signal: controller.signal,
      });

      this.debugService.log(
        `[GitHubService] ${context} response status:`,
        response.status,
        response.statusText
      );
      this.debugService.log(`[GitHubService] ${context} response URL:`, response.url);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('AuthenticationError: Not logged in or insufficient permissions on GitHub.');
        }
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
          throw new RateLimitError(context, retryAfter);
        }
        throw new Error(`GitHub ${context} request failed: ${response.status}`);
      }

      const html = await response.text();
      const pageTitle = (html.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
      const isLoginPage =
        pageTitle.includes('Sign in to GitHub') ||
        html.includes('name="login"') ||
        response.url.includes('/login') ||
        html.includes('action="/session"') ||
        html.includes('class="auth-form"');

      if (isLoginPage) {
        throw new Error('NotLoggedIn: User is not logged in to GitHub.');
      }

      return await transform(html);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetches a GitHub PR listing page and returns parsed + avatar-enriched PRs.
   */
  private async fetchPRs(url: string, context: string): Promise<PullRequest[]> {
    return this.fetchGitHubData(url, context, async (html) => {
      const prs = GitHubHTMLParser.parseFromHTML(html, this.baseURL);
      return this.avatarService.enrichPRsWithAvatars(prs);
    });
  }

  async fetchMergedPRs(): Promise<PullRequest[]> {
    this.debugService.log(
      '[GitHubService] Attempting to fetch merged PRs from:',
      this.mergedPRsURL
    );
    try {
      return await this.fetchPRs(this.mergedPRsURL, 'merged PR fetch');
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      this.debugService.error(
        '[GitHubService] Error in fetchMergedPRs:',
        error instanceof Error ? error.message : error
      );
      throw new Error(
        `Network or parsing error while fetching merged PRs: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async fetchAssignedPRs(): Promise<PullRequest[]> {
    this.debugService.log(
      '[GitHubService] Attempting to fetch assigned PRs from:',
      this.reviewRequestsURL
    );
    try {
      return await this.fetchPRs(this.reviewRequestsURL, 'assigned PR fetch');
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
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

  async fetchReviewedPRs(): Promise<PullRequest[]> {
    this.debugService.log(
      '[GitHubService] Attempting to fetch reviewed PRs from:',
      this.reviewedPRsURL
    );

    try {
      return await this.fetchPRs(this.reviewedPRsURL, 'reviewed PR fetch');
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      this.debugService.error(
        '[GitHubService] Error in fetchReviewedPRs:',
        error instanceof Error ? error.message : error
      );
      if (
        error instanceof Error &&
        (error.message.startsWith('AuthenticationError') || error.message.startsWith('NotLoggedIn'))
      ) {
        throw error;
      }

      throw new Error(
        `Network or parsing error while fetching reviewed PRs: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Fetches authored pull requests from GitHub (PRs created by the user).
   * Fetches from multiple URLs to get different review statuses.
   */
  async fetchAuthoredPRs(): Promise<PullRequest[]> {
    this.debugService.log('[GitHubService] Fetching authored PRs sequentially');

    const fetchSequence: {
      url: string;
      status: 'approved' | 'changes_requested' | 'pending' | 'draft';
    }[] = [
      { url: this.authoredApprovedURL, status: 'approved' },
      { url: this.authoredChangesRequestedURL, status: 'changes_requested' },
      { url: this.authoredPendingURL, status: 'pending' },
      { url: this.authoredDraftURL, status: 'draft' },
    ];

    try {
      const resultsByStatus: Record<string, PullRequest[]> = {};
      for (let i = 0; i < fetchSequence.length; i++) {
        const { url, status } = fetchSequence[i];
        resultsByStatus[status] = await this.fetchFromURL(url, status);
        if (i < fetchSequence.length - 1) {
          await this.delay(REQUEST_DELAY_MS);
        }
      }

      const allAuthoredPRs = fetchSequence.flatMap(({ status }) => resultsByStatus[status]);

      this.debugService.log(
        `[GitHubService] Fetched ${allAuthoredPRs.length} total authored PRs:`,
        fetchSequence.map(({ status }) => `${status}=${resultsByStatus[status].length}`).join(', ')
      );

      return allAuthoredPRs;
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      this.debugService.error(
        '[GitHubService] Error in fetchAuthoredPRs:',
        error instanceof Error ? error.message : error
      );
      if (
        error instanceof Error &&
        (error.message.startsWith('AuthenticationError') || error.message.startsWith('NotLoggedIn'))
      ) {
        throw error;
      }
      throw new Error(
        `Network or parsing error while fetching authored PRs: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchFromURL(
    url: string,
    authorReviewStatus: 'approved' | 'changes_requested' | 'pending' | 'commented' | 'draft'
  ): Promise<PullRequest[]> {
    this.debugService.log(`[GitHubService] Fetching ${authorReviewStatus} PRs from: ${url}`);

    try {
      const prs = await this.fetchPRs(url, `${authorReviewStatus} authored PR fetch`);
      return prs.map((pr) => ({
        ...pr,
        authorReviewStatus,
      }));
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;

      this.debugService.error(
        `[GitHubService] Error fetching ${authorReviewStatus} PRs:`,
        error instanceof Error ? error.message : error
      );

      if (
        error instanceof Error &&
        (error.message.startsWith('AuthenticationError') || error.message.startsWith('NotLoggedIn'))
      ) {
        throw error;
      }

      this.debugService.log(
        `[GitHubService] Returning empty array for ${authorReviewStatus} due to error`
      );
      return [];
    }
  }

  async dispose(): Promise<void> {
    this.debugService.log('[GitHubService] GitHub service disposed');
    this.initialized = false;
  }
}

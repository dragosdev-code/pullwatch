import type { IGitHubService } from '../interfaces/IGitHubService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IAvatarService } from '../interfaces/IAvatarService';
import type { IPatternRegistryService } from '../interfaces/IPatternRegistryService';
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
  STORAGE_KEY_ROUTE_HINT,
  ROUTE_HINT_TTL_MS,
} from '../../common/constants';
import { RateLimitError, ParserBreakageError, GitHubOutageError } from '../../common/errors';
import { GitHubHTMLParser } from './GitHubHTMLParser';
import { GitHubEmbeddedJsonPullHarvest } from './GitHubEmbeddedJsonPullHarvest';
import { NewExperienceGitHubHTMLParser } from './NewExperienceGitHubHTMLParser';
import { delay } from '../../common/utils';

/**
 * Which pulls *list URL* shape {@link GitHubService.fetchPRs} prefers first
 * (from the route hint). DOM shape is not tied to this — {@link GitHubService.parsePullsListHTML}
 * runs the same parser gauntlet for both.
 */
type RouteType = 'search' | 'legacy';

/** Persisted in `chrome.storage.local` so the waterfall skips probing once it
 *  knows which experience a user is on. TTL-gated to auto-recover from rollouts. */
interface RouteHint {
  route: RouteType;
  timestamp: number;
}

// 5xx and Cloudflare edge errors (520-530) signal GitHub infrastructure
// problems, not content/DOM changes. Classifying them separately lets
// PRService preserve cached data and show an "outage" banner instead of
// the misleading "parser broken" banner.
const TRANSIENT_STATUS_CODES = new Set([
  500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530,
]);

function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUS_CODES.has(status);
}

// GitHub outages either resolve in seconds (blip) or last minutes/hours
// (real incident). One retry catches the blip without delaying the error
// signal for real incidents — the next alarm tick handles those.
const TRANSIENT_RETRY_DELAY_MS = 3_000;
const TRANSIENT_MAX_RETRIES = 1;

/**
 * GitHubService handles GitHub HTTP operations for fetching pull requests.
 * Pulls-list HTML is parsed via {@link GitHubService.parsePullsListHTML} (JSON,
 * new-experience HTML, then classic HTML); avatars are enriched by AvatarService.
 */
export class GitHubService implements IGitHubService {
  private debugService: IDebugService;
  private avatarService: IAvatarService;
  private patternRegistryService: IPatternRegistryService;
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

  constructor(
    debugService: IDebugService,
    avatarService: IAvatarService,
    patternRegistryService: IPatternRegistryService
  ) {
    this.debugService = debugService;
    this.avatarService = avatarService;
    this.patternRegistryService = patternRegistryService;
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
   *
   * Retries once on transient errors (5xx, network failures) before giving up,
   * so brief GitHub blips don't immediately surface as errors to the user.
   */
  private async fetchGitHubData<T>(
    url: string,
    context: string,
    transform: (html: string) => T | Promise<T>
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= TRANSIENT_MAX_RETRIES; attempt++) {
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
            throw new Error(
              'AuthenticationError: Not logged in or insufficient permissions on GitHub.'
            );
          }
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
            throw new RateLimitError(context, retryAfter);
          }
          if (isTransientStatus(response.status)) {
            if (attempt < TRANSIENT_MAX_RETRIES) {
              this.debugService.warn(
                `[GitHubService] Transient HTTP ${response.status} during ${context} — retrying in ${TRANSIENT_RETRY_DELAY_MS}ms`
              );
              await delay(TRANSIENT_RETRY_DELAY_MS);
              continue;
            }
            throw new GitHubOutageError(context, response.status);
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
      } catch (error) {
        lastError = error;

        // Auth, rate-limit, parser, and outage errors are already classified
        // — bubble them immediately without retrying.
        if (
          error instanceof RateLimitError ||
          error instanceof ParserBreakageError ||
          error instanceof GitHubOutageError ||
          (error instanceof Error &&
            (error.message.startsWith('AuthenticationError') ||
              error.message.startsWith('NotLoggedIn')))
        ) {
          throw error;
        }

        // Network-level failures (AbortError from timeout, TypeError from
        // DNS/connection reset) are never the user's fault or a DOM change,
        // so classify them as outage to preserve cached data in the popup.
        const isNetworkFailure =
          (error instanceof DOMException && error.name === 'AbortError') ||
          error instanceof TypeError;

        if (isNetworkFailure && attempt < TRANSIENT_MAX_RETRIES) {
          this.debugService.warn(
            `[GitHubService] Network error during ${context} — retrying in ${TRANSIENT_RETRY_DELAY_MS}ms`
          );
          await delay(TRANSIENT_RETRY_DELAY_MS);
          continue;
        }

        if (isNetworkFailure) {
          throw new GitHubOutageError(context);
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }

  // ─── Route hint persistence ──────────────────────────────────────────────
  // The hint remembers which dashboard experience (/pulls or /pulls/search)
  // last succeeded so that steady-state polling issues one HTTP request per
  // list rather than probing both endpoints every cycle.

  /** Reads the cached route hint. Returns `null` when absent or expired. */
  private async readRouteHint(): Promise<RouteType | null> {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_ROUTE_HINT);
      const hint = data[STORAGE_KEY_ROUTE_HINT] as RouteHint | undefined;
      if (!hint) return null;

      const expired = Date.now() - hint.timestamp > ROUTE_HINT_TTL_MS;
      if (expired) return null;

      return hint.route;
    } catch {
      // Storage transient error — degrade to "no hint" so the waterfall
      // probes both routes rather than crashing the fetch cycle.
      return null;
    }
  }

  /** Persists the successful route so subsequent cycles skip probing. */
  private writeRouteHint(route: RouteType): void {
    const hint: RouteHint = { route, timestamp: Date.now() };
    // Fire-and-forget: if storage fails, the next cycle re-probes.
    chrome.storage.local.set({ [STORAGE_KEY_ROUTE_HINT]: hint }).catch(() => {});
  }

  /** Clears a stale hint when both routes fail, forcing a fresh probe next cycle. */
  private clearRouteHint(): void {
    chrome.storage.local.remove(STORAGE_KEY_ROUTE_HINT).catch(() => {});
  }

  // ─── URL transformation ─────────────────────────────────────────────────

  /**
   * Injects `/search` into a legacy `/pulls?q=…` URL to produce the new
   * experience's `/pulls/search?q=…` form. Idempotent — already-transformed
   * URLs pass through unchanged.
   *
   * All URL templates in constants.ts use the legacy form, so the waterfall
   * calls this only for the `'search'` route; the original URL is already
   * correct for the `'legacy'` route.
   */
  private static toSearchUrl(url: string): string {
    if (url.includes('/pulls/search?')) return url;
    return url.replace('/pulls?', '/pulls/search?');
  }

  // ─── Parse pipeline (URL-agnostic) ───────────────────────────────────────

  /**
   * Single gauntlet for every pulls-list HTML response, regardless of whether
   * {@link fetchPRs} used `/pulls` or `/pulls/search`. GitHub’s DOM does not
   * follow the URL under feature-flag rollout: JSON may be missing or reshaped
   * while new-experience HTML is still present — skipping
   * {@link NewExperienceGitHubHTMLParser} on the “legacy” URL produced silent
   * empty lists. {@link ParserBreakageError} from {@link GitHubHTMLParser} or
   * {@link NewExperienceGitHubHTMLParser} propagates so {@link fetchPRs} can try
   * the alternate URL.
   */
  private parsePullsListHTML(html: string): PullRequest[] {
    const jsonResult = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);
    if (jsonResult !== null) return jsonResult;

    const patterns = this.patternRegistryService.getPatterns();
    const newExpResult = NewExperienceGitHubHTMLParser.parseFromHTML(html, this.baseURL, patterns);
    if (newExpResult !== null) return newExpResult;

    return GitHubHTMLParser.parseFromHTML(html, this.baseURL, patterns);
  }

  /**
   * Parses HTML for the route implied by the current URL attempt. Parsing is
   * identical for both routes; the `route` argument is unused but kept so
   * call sites stay explicit.
   */
  private parseForRoute(html: string, _route: RouteType, _context: string): PullRequest[] {
    return this.parsePullsListHTML(html);
  }

  // ─── Waterfall fetch orchestrator ───────────────────────────────────────

  /**
   * Fetches a GitHub PR listing page and returns parsed + avatar-enriched PRs.
   *
   * Implements a two-route waterfall:
   * 1. Determines the primary route from the cached hint (defaults to
   *    `'search'` because GitHub is actively rolling out the new experience).
   * 2. Fetches + parses the primary route. On success, caches the hint.
   * 2b. If the primary route is `legacy`, the parsed list is empty, and the
   *     search URL differs, fetches `/pulls/search` once and uses that result.
   *     New experience may return a 200 shell on `/pulls` that parses as zero
   *     PRs without throwing — this escapes a stuck `legacy` hint until TTL.
   * 3. If the primary route throws {@link ParserBreakageError}, fetches the
   *    fallback route. On success, caches the corrected hint.
   * 4. If both routes fail, clears the hint so the next cycle probes fresh.
   *
   * Auth, rate-limit, and outage errors bubble immediately — the other
   * route would hit the same infrastructure problem.
   *
   * Kicks off a non-blocking pattern refresh so the next cycle benefits
   * from any remote config updates.
   */
  private async fetchPRs(url: string, context: string): Promise<PullRequest[]> {
    this.patternRegistryService.refreshIfStale().catch(() => {});

    const hint = await this.readRouteHint();

    // Default to 'search' (new experience) when no hint exists —
    // GitHub's rollout is forward, so new > legacy is the more
    // common path for first-time probing.
    const primaryRoute: RouteType = hint ?? 'search';
    const fallbackRoute: RouteType = primaryRoute === 'search' ? 'legacy' : 'search';

    const primaryUrl = primaryRoute === 'search' ? GitHubService.toSearchUrl(url) : url;
    const fallbackUrl = fallbackRoute === 'search' ? GitHubService.toSearchUrl(url) : url;

    const hintSource: 'search' | 'legacy' | 'none' = hint ?? 'none';

    // ── Primary attempt ────────────────────────────────────────────
    try {
      this.debugService.log(
        `[GitHubService] fetchPRs routing (${context}): route=${primaryRoute}, url=${primaryUrl}, hint=${hintSource}, template=${url}`
      );
      let prs = await this.fetchGitHubData(primaryUrl, context, (html) =>
        this.parseForRoute(html, primaryRoute, context)
      );

      if (prs.length === 0 && primaryRoute === 'legacy' && primaryUrl !== fallbackUrl) {
        this.debugService.log(
          `[GitHubService] fetchPRs empty list on legacy URL — reprobing search (${context})`
        );
        try {
          prs = await this.fetchGitHubData(
            fallbackUrl,
            `${context} (empty legacy → search reprobe)`,
            (html) => this.parseForRoute(html, 'search', context)
          );
          this.writeRouteHint('search');
          return this.avatarService.enrichPRsWithAvatars(prs);
        } catch (reprobeError) {
          if (!(reprobeError instanceof ParserBreakageError)) throw reprobeError;
          this.debugService.warn(
            `[GitHubService] Search reprobe failed after empty legacy (${context}) — clearing route hint`
          );
          this.clearRouteHint();
          return this.avatarService.enrichPRsWithAvatars(prs);
        }
      }

      this.writeRouteHint(primaryRoute);
      return this.avatarService.enrichPRsWithAvatars(prs);
    } catch (error) {
      // Only ParserBreakageError triggers fallback — all other errors
      // (auth, rate-limit, outage) bubble immediately because the
      // other route would hit the same infrastructure problem.
      if (!(error instanceof ParserBreakageError)) throw error;

      this.debugService.warn(
        `[GitHubService] Primary route '${primaryRoute}' failed for ${context} — trying fallback '${fallbackRoute}'`
      );
    }

    // ── Fallback attempt ───────────────────────────────────────────
    try {
      this.debugService.log(
        `[GitHubService] fetchPRs fallback routing (${context}): route=${fallbackRoute}, url=${fallbackUrl}, template=${url}`
      );
      const prs = await this.fetchGitHubData(fallbackUrl, `${context} (fallback)`, (html) =>
        this.parseForRoute(html, fallbackRoute, context)
      );
      this.writeRouteHint(fallbackRoute);
      return this.avatarService.enrichPRsWithAvatars(prs);
    } catch (error) {
      if (error instanceof ParserBreakageError) {
        // Both routes exhausted — clear the stale hint so the next
        // cycle probes fresh instead of repeating a known-bad route.
        this.clearRouteHint();
      }
      throw error;
    }
  }

  async fetchMergedPRs(): Promise<PullRequest[]> {
    this.debugService.log(
      '[GitHubService] fetchMergedPRs — list template (effective URL in fetchPRs routing):',
      this.mergedPRsURL
    );
    try {
      return await this.fetchPRs(this.mergedPRsURL, 'merged PR fetch');
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      if (error instanceof GitHubOutageError) throw error;
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
      '[GitHubService] fetchAssignedPRs — list template (effective URL in fetchPRs routing):',
      this.reviewRequestsURL
    );
    try {
      return await this.fetchPRs(this.reviewRequestsURL, 'assigned PR fetch');
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      if (error instanceof GitHubOutageError) throw error;
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
      '[GitHubService] fetchReviewedPRs — list template (effective URL in fetchPRs routing):',
      this.reviewedPRsURL
    );

    try {
      return await this.fetchPRs(this.reviewedPRsURL, 'reviewed PR fetch');
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      if (error instanceof GitHubOutageError) throw error;
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
          await delay(REQUEST_DELAY_MS);
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
      if (error instanceof GitHubOutageError) throw error;
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

  private async fetchFromURL(
    url: string,
    authorReviewStatus: 'approved' | 'changes_requested' | 'pending' | 'commented' | 'draft'
  ): Promise<PullRequest[]> {
    this.debugService.log(
      `[GitHubService] Fetching ${authorReviewStatus} PRs — template (effective URL in fetchPRs routing): ${url}`
    );

    try {
      const prs = await this.fetchPRs(url, `${authorReviewStatus} authored PR fetch`);
      return prs.map((pr) => ({
        ...pr,
        authorReviewStatus,
      }));
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      if (error instanceof GitHubOutageError) throw error;

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

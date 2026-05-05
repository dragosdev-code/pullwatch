import type { IGitHubService } from '../interfaces/IGitHubService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IAvatarService } from '../interfaces/IAvatarService';
import type { IPatternRegistryService } from '../interfaces/IPatternRegistryService';
import type { PullRequest } from '@common/types';
import type { CompiledPattern } from '@common/pattern-types';
import {
  GITHUB_BASE_URL,
  GITHUB_REVIEW_REQUESTS_URL_TEMPLATE,
  GITHUB_MERGED_PRS_URL_TEMPLATE,
  GITHUB_REVIEWED_PRS_URL_TEMPLATE,
  GITHUB_AUTHORED_APPROVED_URL_TEMPLATE,
  GITHUB_AUTHORED_CHANGES_REQUESTED_URL_TEMPLATE,
  GITHUB_AUTHORED_PENDING_URL_TEMPLATE,
  GITHUB_AUTHORED_DRAFT_URL_TEMPLATE,
  USER_AGENT,
  REQUEST_DELAY_MS,
  GITHUB_FETCH_TIMEOUT_MS,
  STORAGE_KEY_ROUTE_HINT,
  ROUTE_HINT_TTL_MS,
} from '@common/constants';
import {
  GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE,
  RateLimitError,
  ParserBreakageError,
  GitHubOutageError,
  isGitHubWebSessionAuthError,
} from '@common/errors';
import { isOfflineError } from '@common/network-utils';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { parsePullsListHTML } from '@common/pulls-list-parser';
import { toPullsSearchUrl } from '@common/github-url-utils';
import { delay } from '@common/utils';
import { isGitHubLoggedOutHtmlShell } from '@common/github-html-session';
import { mergeAuthoredPrLists, type AuthorReviewBucket } from '@common/authored-merge';

/**
 * Which pulls *list URL* shape {@link GitHubService.fetchPRs} prefers first
 * (from the route hint). DOM shape is not tied to this — the shared
 * {@link parsePullsListHTML} gauntlet runs for both routes.
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
// WHY [MV3 budget]: A retrying list fetch must settle before Chrome's service-worker
// idle window can interrupt the surrounding storage write cycle. Per-attempt timeout
// still caps individual sockets; this caps retry delay + all attempts together.
const GITHUB_FETCH_OVERALL_DEADLINE_MS = 18_000;

/**
 * GitHubService handles GitHub HTTP operations for fetching pull requests.
 * Pulls-list HTML is parsed via the shared {@link parsePullsListHTML} gauntlet
 * (JSON, new-experience HTML, then classic HTML); avatars are enriched by
 * AvatarService.
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
  private authoredDraftURL: string;
  /**
   * Set from each successful {@link fetchGitHubData} HTML body via {@link viewerLogin} patterns.
   * Cleared at the start of {@link fetchPRs} so a skipped network path does not reuse a stale login.
   */
  private lastResolvedViewerLogin: string | null = null;

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

  getLastResolvedViewerLogin(): string | null {
    return this.lastResolvedViewerLogin;
  }

  /**
   * WHY [flat chain]: Same contract as list parsing — walk registry `viewerLogin` patterns in order;
   * first non-empty `login` capture wins. Empty capture is ignored so logged-out metas do not
   * poison {@link PRService} account-swap detection.
   */
  private static extractViewerLoginFromHtml(html: string, chain: CompiledPattern[]): string | null {
    for (const p of chain) {
      // WHY [lastIndex]: Compiled regex objects are shared across fetches. If remote config
      // ever introduces `g`, exec() mutates lastIndex and can skip later matches unless reset.
      p.compiled.lastIndex = 0;
      const m = p.compiled.exec(html);
      if (!m) continue;
      const idx = p.captureGroups?.login ?? 1;
      const raw = m[idx];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim();
      }
    }
    return null;
  }

  /**
   * Shared GitHub fetch pipeline that retrieves and transforms HTML responses.
   * Uses an AbortController to guarantee the request settles within
   * {@link GITHUB_FETCH_TIMEOUT_MS}, preventing permanent deadlocks in
   * PRService's deduplication locks when GitHub hangs.
   *
   * Retries once on transient errors (5xx, network failures) before giving up,
   * so brief GitHub blips don't immediately surface as errors to the user.
   * The retry loop also has an overall deadline so one list cannot spend the
   * full per-attempt timeout plus retry delay during a broader fetch wave.
   */
  private async fetchGitHubData<T>(
    url: string,
    context: string,
    transform: (html: string) => T | Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    const deadlineAt = Date.now() + GITHUB_FETCH_OVERALL_DEADLINE_MS;

    for (let attempt = 0; attempt <= TRANSIENT_MAX_RETRIES; attempt++) {
      const remainingBudgetMs = deadlineAt - Date.now();
      if (remainingBudgetMs <= 0) {
        throw new GitHubOutageError(context);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        Math.min(GITHUB_FETCH_TIMEOUT_MS, remainingBudgetMs)
      );

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
              if (Date.now() + TRANSIENT_RETRY_DELAY_MS >= deadlineAt) {
                throw new GitHubOutageError(context, response.status);
              }
              this.debugService.warn(
                `[GitHubService] Transient HTTP ${response.status} during ${context} — retrying in ${TRANSIENT_RETRY_DELAY_MS}ms`
              );
              await delay(TRANSIENT_RETRY_DELAY_MS);
              continue;
            }
            throw new GitHubOutageError(context, response.status);
          }
          // WHY [404 + body]: Read HTML and use `user-login` / `is_logged_out_page` metas (see
          // `github-html-session.ts`). A signed-in user can still get 404 on a bad path; their shell
          // keeps a non-empty `user-login`, so we must not treat that as session loss.
          if (response.status === 404) {
            const html404 = await response.text();
            if (isGitHubLoggedOutHtmlShell(html404, response.url)) {
              throw new Error(GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE);
            }
            throw new Error(`GitHub ${context} request failed: 404`);
          }
          throw new Error(`GitHub ${context} request failed: ${response.status}`);
        }

        const html = await response.text();
        if (isGitHubLoggedOutHtmlShell(html, response.url)) {
          throw new Error(GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE);
        }

        this.lastResolvedViewerLogin = GitHubService.extractViewerLoginFromHtml(
          html,
          this.patternRegistryService.getPatterns().viewerLogin
        );

        return await transform(html);
      } catch (error) {
        lastError = error;

        // Auth, rate-limit, parser, and outage errors are already classified
        // — bubble them immediately without retrying.
        if (
          error instanceof RateLimitError ||
          error instanceof ParserBreakageError ||
          error instanceof GitHubOutageError ||
          isGitHubWebSessionAuthError(error)
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
          if (Date.now() + TRANSIENT_RETRY_DELAY_MS >= deadlineAt) {
            throw new GitHubOutageError(context);
          }
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
      const data = await chromeExtensionService.storage.local.get(STORAGE_KEY_ROUTE_HINT);
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
    chromeExtensionService.storage.local.set({ [STORAGE_KEY_ROUTE_HINT]: hint }).catch(() => {});
  }

  /** Clears a stale hint when both routes fail, forcing a fresh probe next cycle. */
  private clearRouteHint(): void {
    chromeExtensionService.storage.local.remove(STORAGE_KEY_ROUTE_HINT).catch(() => {});
  }

  // ─── Parse pipeline (URL-agnostic) ───────────────────────────────────────

  /**
   * Parses HTML for the route implied by the current URL attempt. Parsing is
   * identical for both routes (the `route` argument is kept so call sites
   * stay explicit): the shared {@link parsePullsListHTML} gauntlet walks
   * JSON → new-experience HTML → legacy HTML because GitHub's DOM does not
   * follow the URL under feature-flag rollout.
   */
  private parseForRoute(html: string, _route: RouteType, _context: string): PullRequest[] {
    return parsePullsListHTML(html, this.baseURL, this.patternRegistryService.getPatterns());
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

    // WHY: If this fetch short-circuits on cache upstream, we must not attribute a prior
    // request's viewer to this cycle; PRService persists identity after the alarm block.
    this.lastResolvedViewerLogin = null;

    const hint = await this.readRouteHint();

    // Default to 'search' (new experience) when no hint exists —
    // GitHub's rollout is forward, so new > legacy is the more
    // common path for first-time probing.
    const primaryRoute: RouteType = hint ?? 'search';
    const fallbackRoute: RouteType = primaryRoute === 'search' ? 'legacy' : 'search';

    const primaryUrl = primaryRoute === 'search' ? toPullsSearchUrl(url) : url;
    const fallbackUrl = fallbackRoute === 'search' ? toPullsSearchUrl(url) : url;

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

  /** Auth/session loss is expected; keep it out of error-level noise. */
  private logListFetchFailure(messagePrefix: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : error;
    if (isGitHubWebSessionAuthError(error)) {
      this.debugService.warn(`${messagePrefix} (no GitHub web session)`, detail);
      return;
    }
    // WHY [silent]: Transient offline / `Failed to fetch` when the OS network stack is not
    // ready after wake — list fetch will retry on the next alarm without polluting error logs.
    if (isOfflineError(error)) {
      return;
    }
    this.debugService.error(messagePrefix, detail);
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
      this.logListFetchFailure('[GitHubService] Error in fetchMergedPRs:', error);
      if (isGitHubWebSessionAuthError(error)) {
        throw error;
      }
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
      this.logListFetchFailure('[GitHubService] Error in fetchAssignedPRs:', error);
      if (isGitHubWebSessionAuthError(error)) {
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
      this.logListFetchFailure('[GitHubService] Error in fetchReviewedPRs:', error);
      if (isGitHubWebSessionAuthError(error)) {
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
      status: AuthorReviewBucket;
    }[] = [
      { url: this.authoredApprovedURL, status: 'approved' },
      { url: this.authoredChangesRequestedURL, status: 'changes_requested' },
      { url: this.authoredPendingURL, status: 'pending' },
      { url: this.authoredDraftURL, status: 'draft' },
    ];

    try {
      const resultsByStatus: Record<AuthorReviewBucket, PullRequest[]> = {
        approved: [],
        changes_requested: [],
        pending: [],
        draft: [],
      };
      for (let i = 0; i < fetchSequence.length; i++) {
        const { url, status } = fetchSequence[i];
        resultsByStatus[status] = await this.fetchFromURL(url, status);
        if (i < fetchSequence.length - 1) {
          await delay(REQUEST_DELAY_MS);
        }
      }

      const rawCount = fetchSequence.reduce(
        (acc, { status }) => acc + resultsByStatus[status].length,
        0
      );
      const allAuthoredPRs = mergeAuthoredPrLists(resultsByStatus);

      this.debugService.log(
        `[GitHubService] Fetched ${rawCount} raw authored PRs across buckets:`,
        fetchSequence.map(({ status }) => `${status}=${resultsByStatus[status].length}`).join(', ')
      );
      this.debugService.log(
        `[GitHubService] Merged authored PRs: ${allAuthoredPRs.length} (${
          rawCount - allAuthoredPRs.length
        } duplicates collapsed)`
      );

      return allAuthoredPRs;
    } catch (error: unknown) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof ParserBreakageError) throw error;
      if (error instanceof GitHubOutageError) throw error;
      this.logListFetchFailure('[GitHubService] Error in fetchAuthoredPRs:', error);
      if (isGitHubWebSessionAuthError(error)) {
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

      this.logListFetchFailure(`[GitHubService] Error fetching ${authorReviewStatus} PRs:`, error);

      if (isGitHubWebSessionAuthError(error)) {
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

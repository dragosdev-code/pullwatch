import type { IBadgeService } from '@background/interfaces/IBadgeService';
import type { IDebugService } from '@background/interfaces/IDebugService';
import type { IHealthStatusService } from '@background/interfaces/IHealthStatusService';
import type { IRateLimitService } from '@background/interfaces/IRateLimitService';
import type { PullRequest } from '@common/types';
import {
  GitHubOutageError,
  isGitHubWebSessionAuthError,
  ParserBreakageError,
  RateLimitError,
} from '@common/errors';
import { isOfflineError } from '@common/network-utils';
import { classifyTransportFailure, type SiteAccessProbe } from '@common/site-access-classifier';
import type { ListKind } from './pr-list-trust';

export interface PrFetchErrorHandlerParams {
  listKind: ListKind;
  oldPRs: PullRequest[];
  updateBadgeOnError: boolean;
  transportErrorLabel: string;
}

export class PrFetchErrorHandler {
  constructor(
    private readonly debugService: IDebugService,
    private readonly badgeService: IBadgeService,
    private readonly healthStatusService: IHealthStatusService,
    private readonly rateLimitService: IRateLimitService,
    /**
     * WHY [probe injection]: `chrome.permissions.contains` is the only signal that can split a
     * transport-shape `GitHubOutageError` (no HTTP status) into "GitHub actually down" vs "user
     * disabled site access for the extension". Inject the probe so this handler stays unit-testable
     * without a Chromium harness. See {@link classifyTransportFailure}.
     */
    private readonly siteAccessProbe: SiteAccessProbe
  ) {}

  /**
   * Centralizes the domain-error taxonomy shared by every list fetch: parser breakage and GitHub
   * outage recover by returning the stale list and signaling health; rate-limit records the hit
   * then re-throws; anything else logs and re-throws.
   *
   * WHY [badge only for assigned]: The toolbar badge reflects the user's pending review count,
   * which lives in the assigned list. Merged and authored errors must NOT paint the error badge;
   * an outage while fetching a secondary list would otherwise hide a healthy assigned count.
   */
  async handle(error: unknown, params: PrFetchErrorHandlerParams): Promise<PullRequest[]> {
    const { listKind, oldPRs, updateBadgeOnError, transportErrorLabel } = params;

    if (error instanceof ParserBreakageError) {
      this.debugService.warn(
        `[PrFetchErrorHandler] ${error.message} — preserving ${oldPRs.length} stored ${listKind} PRs.`
      );
      if (updateBadgeOnError) await this.badgeService.setErrorBadge();
      await this.healthStatusService.signalParserBreakage(error.message);
      return oldPRs;
    }
    if (error instanceof GitHubOutageError) {
      this.debugService.warn(
        `[PrFetchErrorHandler] ${error.message} — preserving ${oldPRs.length} stored ${listKind} PRs.`
      );
      if (updateBadgeOnError) await this.badgeService.setErrorBadge();
      // WHY [reason classification]: A `GitHubOutageError` with no `httpStatus` is the
      // transport-shape branch — TypeError/AbortError where the request never reached GitHub.
      // That covers both genuine outages and the chrome://extensions "Allow access on click"
      // case, which the popup needs to message differently. HTTP-status branches (5xx, Cloudflare
      // edge codes) stay `'transport'` because GitHub did respond; the failure is on their side.
      const reason =
        error.httpStatus === null
          ? await classifyTransportFailure(this.siteAccessProbe)
          : 'transport';
      if (reason === 'site_access_blocked') {
        this.debugService.warn(
          `[PrFetchErrorHandler] Classified ${listKind} transport failure as site_access_blocked (chrome://extensions site access is off for this extension).`
        );
      }
      await this.healthStatusService.signalGitHubOutage(error.message, reason);
      return oldPRs;
    }
    if (error instanceof RateLimitError) {
      await this.rateLimitService.recordRateLimitHit(error.retryAfterSeconds);
    }
    this.logTransportFailure(transportErrorLabel, error);
    if (updateBadgeOnError) await this.badgeService.setErrorBadge();
    throw error;
  }

  /** Missing GitHub cookie session is normal; do not log it as a service fault. */
  private logTransportFailure(label: string, error: unknown): void {
    if (isGitHubWebSessionAuthError(error)) {
      this.debugService.warn(
        `[PrFetchErrorHandler] ${label} — GitHub not signed in (expected until user logs in on github.com):`,
        error instanceof Error ? error.message : error
      );
      return;
    }
    // WHY [silent]: Aligns with GitHubService — transient fetch transport after wake, not a PR pipeline bug.
    if (isOfflineError(error)) {
      return;
    }
    this.debugService.error(`[PrFetchErrorHandler] ${label}:`, error);
  }
}

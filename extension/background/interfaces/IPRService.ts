import type { PullRequest } from '@common/types';
import type { IService } from './IService';
import type { GitHubStatusSnapshot } from './IGitHubStatusClient';

/**
 * Interface for the PR service that handles pull request management and coordination.
 */
export interface IPRService extends IService {
  /**
   * Fetches and updates assigned/review pull requests with state management.
   * @param forceRefresh - Bypass cache AND skip notifications (for install/startup/manual refresh)
   * @param bypassCache - Bypass cache but still show notifications (for alarm-triggered fetches)
   * @param waveStatus - Pre-fetched Statuspage snapshot shared across the whole alarm/manual wave so
   *   `PrListTrustAssessor.assess` does not re-hit `summary.json` for each list.
   */
  fetchAndUpdateAssignedPRs(
    forceRefresh?: boolean,
    bypassCache?: boolean,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]>;

  /**
   * Gets currently stored assigned/review pull requests.
   */
  getStoredAssignedPRs(): Promise<PullRequest[]>;

  /**
   * Sets the action badge from persisted assigned PRs, sync extension settings, and local
   * health flags (parser breakage, GitHub outage). Called from `BackgroundManager.performInitialSetup`
   * so the badge matches storage before `EventService` handlers run, without a GitHub round-trip.
   */
  syncBadgeFromStorage(): Promise<void>;

  /**
   * Gets currently stored authored pull requests.
   */
  getStoredAuthoredPRs(): Promise<PullRequest[]>;

  /**
   * Gets currently stored merged pull requests.
   */
  getStoredMergedPRs(): Promise<PullRequest[]>;

  /**
   * Fetches and updates authored pull requests with state management.
   * @param forceRefresh - Bypass cache
   * @param bypassCache - Bypass cache (for alarm-triggered fetches)
   * @param waveStatus - See {@link fetchAndUpdateAssignedPRs}.
   */
  updateAuthoredPRs(
    forceRefresh?: boolean,
    bypassCache?: boolean,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]>;

  /**
   * Fetches and updates merged pull requests with state management.
   * @param forceRefresh - Bypass cache AND skip notifications
   * @param bypassCache - Bypass cache but still show notifications (for alarm-triggered fetches)
   * @param waveStatus - See {@link fetchAndUpdateAssignedPRs}.
   */
  updateMergedPRs(
    forceRefresh?: boolean,
    bypassCache?: boolean,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]>;

  /**
   * Compares old and new PR lists to identify new PRs.
   */
  comparePRs(
    oldPRs: PullRequest[],
    freshPRs: PullRequest[]
  ): {
    newPRs: PullRequest[];
    allPRsWithStatus: PullRequest[];
  };

  /**
   * Call once at the start of an alarm / install / startup / manual-refresh **wave** before the
   * first list fetch. Resets coordination so `pr_list_churn` signaled on one list is not cleared by
   * a later list’s successful-path {@link IHealthStatusService.clearGitHubOutage} in the same wave.
   */
  beginPrListHealthWave(): void;

  /**
   * Writes `github_viewer_identity` from the last HTML-derived login.
   * Call once after a successful fetch cycle (alarm block or single manual refresh) so merged/authored
   * still compare against the pre-cycle baseline in storage.
   */
  persistResolvedViewerIdentity(): Promise<void>;
}

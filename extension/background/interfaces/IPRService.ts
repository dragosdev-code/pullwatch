import type { PullRequest } from '@common/types';
import type { IService } from './IService';

/**
 * Interface for the PR service that handles pull request management and coordination.
 */
export interface IPRService extends IService {
  /**
   * Fetches and updates assigned/review pull requests with state management.
   * @param forceRefresh - Bypass cache AND skip notifications (for install/startup/manual refresh)
   * @param bypassCache - Bypass cache but still show notifications (for alarm-triggered fetches)
   */
  fetchAndUpdateAssignedPRs(forceRefresh?: boolean, bypassCache?: boolean): Promise<PullRequest[]>;

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
   */
  updateAuthoredPRs(forceRefresh?: boolean, bypassCache?: boolean): Promise<PullRequest[]>;

  /**
   * Fetches and updates merged pull requests with state management.
   * @param forceRefresh - Bypass cache AND skip notifications
   * @param bypassCache - Bypass cache but still show notifications (for alarm-triggered fetches)
   */
  updateMergedPRs(forceRefresh?: boolean, bypassCache?: boolean): Promise<PullRequest[]>;

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
   * Writes `github_viewer_identity` from the last HTML-derived login.
   * Call once after a successful fetch cycle (alarm block or single manual refresh) so merged/authored
   * still compare against the pre-cycle baseline in storage.
   */
  persistResolvedViewerIdentity(): Promise<void>;
}

import type { PullRequest } from '../../common/types';

/**
 * Interface for the PR service that handles pull request management and coordination.
 */
export interface IPRService {
  /**
   * Fetches and updates pull requests with state management.
   */
  fetchAndUpdatePRs(forceRefresh?: boolean): Promise<PullRequest[]>;

  /**
   * Gets currently stored pull requests.
   */
  getStoredPRs(): Promise<PullRequest[]>;

  /**
   * Marks pull requests as read/seen.
   */
  markPRsAsRead(prIds: string[]): Promise<void>;

  /**
   * Gets new pull requests since last check.
   */
  getNewPRs(): Promise<PullRequest[]>;

  /**
   * Refreshes pull request data from GitHub.
   */
  refreshPRs(): Promise<PullRequest[]>;

  /**
   * Gets pull request statistics.
   */
  getPRStats(): Promise<{
    total: number;
    new: number;
    lastUpdate: number | null;
  }>;

  /**
   * Filters pull requests by criteria.
   */
  filterPRs(criteria: {
    repoName?: string;
    status?: string;
    isNew?: boolean;
  }): Promise<PullRequest[]>;

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
   * Initializes the PR service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the PR service.
   */
  dispose(): Promise<void>;
}

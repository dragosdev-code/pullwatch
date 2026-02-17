import type { PullRequest } from '../../common/types';

/**
 * Interface for the PR service that handles pull request management and coordination.
 */
export interface IPRService {
  /**
   * Fetches and updates assigned/review pull requests with state management.
   */
  fetchAndUpdateAssignedPRs(forceRefresh?: boolean): Promise<PullRequest[]>;

  /**
   * Gets currently stored assigned/review pull requests.
   */
  getStoredAssignedPRs(): Promise<PullRequest[]>;

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
   */
  updateAuthoredPRs(forceRefresh?: boolean): Promise<PullRequest[]>;

  /**
   * Fetches and updates merged pull requests with state management.
   */
  updateMergedPRs(forceRefresh?: boolean): Promise<PullRequest[]>;

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

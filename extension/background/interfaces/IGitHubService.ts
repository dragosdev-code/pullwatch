import type { PullRequest } from '../../common/types';

/**
 * Interface for the GitHub service that handles GitHub API operations.
 */
export interface IGitHubService {
  /**
   * Fetches assigned pull requests from GitHub.
   */
  fetchAssignedPRs(): Promise<PullRequest[]>;

  /**
   * Fetches pull requests that the user has already reviewed but are still open.
   */
  fetchReviewedPRs(): Promise<PullRequest[]>;

  /**
   * Fetches user's merged pull requests from GitHub.
   */
  fetchMergedPRs(): Promise<PullRequest[]>;

  /**
   * Fetches authored pull requests (PRs created by the user) with different review statuses.
   */
  fetchAuthoredPRs(): Promise<PullRequest[]>;

  /**
   * Initializes the GitHub service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the GitHub service.
   */
  dispose(): Promise<void>;
}

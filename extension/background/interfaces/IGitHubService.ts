import type { PullRequest } from '@common/types';
import type { IService } from './IService';

/**
 * Interface for the GitHub service that handles GitHub API operations.
 */
export interface IGitHubService extends IService {
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
   * Login parsed from the last successful pulls-list HTML in this worker wake (null if unknown).
   * Used with {@link IStorageService.getGitHubViewerIdentity} for account-swap detection.
   */
  getLastResolvedViewerLogin(): string | null;
}

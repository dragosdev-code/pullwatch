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
   * Fetches pull requests by query.
   */
  fetchPRsByQuery(query: string): Promise<PullRequest[]>;

  /**
   * Gets user information from GitHub.
   */
  getUserInfo(): Promise<{ login: string; name: string; avatar_url: string } | null>;

  /**
   * Validates the GitHub token.
   */
  validateToken(): Promise<boolean>;

  /**
   * Sets the GitHub token.
   */
  setToken(token: string): Promise<void>;

  /**
   * Gets the current GitHub token.
   */
  getToken(): Promise<string | null>;

  /**
   * Clears the GitHub token.
   */
  clearToken(): Promise<void>;

  /**
   * Initializes the GitHub service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the GitHub service.
   */
  dispose(): Promise<void>;
}

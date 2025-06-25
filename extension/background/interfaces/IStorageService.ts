import type { PullRequest } from '../../common/types';

/**
 * Interface for the storage service that handles Chrome extension storage operations.
 */
export interface IStorageService {
  /**
   * Gets stored pull requests.
   */
  getStoredPRs(): Promise<{ prs: PullRequest[]; timestamp?: number } | null>;

  /**
   * Sets stored pull requests.
   */
  setStoredPRs(prs: PullRequest[]): Promise<void>;

  /**
   * Gets the last fetch timestamp.
   */
  getLastFetchTime(): Promise<number | null>;

  /**
   * Sets the last fetch timestamp.
   */
  setLastFetchTime(timestamp: number): Promise<void>;

  /**
   * Gets extension settings.
   */
  getExtensionSettings(): Promise<{
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    fetchInterval: number;
  }>;

  /**
   * Sets extension settings.
   */
  setExtensionSettings(settings: {
    notificationsEnabled?: boolean;
    soundEnabled?: boolean;
    fetchInterval?: number;
  }): Promise<void>;

  /**
   * Gets a value from storage by key.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Sets a value in storage by key.
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Removes a value from storage by key.
   */
  remove(key: string): Promise<void>;

  /**
   * Clears all storage data.
   */
  clear(): Promise<void>;

  /**
   * Initializes the storage service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the storage service.
   */
  dispose(): Promise<void>;
}

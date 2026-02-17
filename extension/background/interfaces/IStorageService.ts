import type { ExtensionSettings, PullRequest, StorageKeyMap, StorageKeyPRs } from '../../common/types';

/**
 * Interface for the storage service that handles Chrome extension storage operations.
 */
export interface IStorageService {
  /**
   * Gets stored pull requests by storage key.
   */
  getStoredPRs(key: StorageKeyPRs): Promise<{ prs: PullRequest[]; timestamp?: number } | null>;

  /**
   * Sets stored pull requests by storage key.
   */
  setStoredPRs(key: StorageKeyPRs, prs: PullRequest[]): Promise<void>;

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
  getExtensionSettings(): Promise<ExtensionSettings>;

  /**
   * Sets extension settings.
   */
  setExtensionSettings(settings: Partial<ExtensionSettings>): Promise<void>;

  /**
   * Gets a value from storage by key.
   */
  get<K extends keyof StorageKeyMap>(key: K): Promise<StorageKeyMap[K] | null>;
  get<T>(key: string): Promise<T | null>;

  /**
   * Sets a value in storage by key.
   */
  set<K extends keyof StorageKeyMap>(key: K, value: StorageKeyMap[K]): Promise<void>;
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Removes a value from storage by key.
   */
  remove(key: string): Promise<void>;

  /**
   * Initializes the storage service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the storage service.
   */
  dispose(): Promise<void>;
}

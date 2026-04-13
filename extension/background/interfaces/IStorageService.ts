import type {
  ExtensionSettings,
  GitHubViewerIdentity,
  PullRequest,
  StorageKeyMap,
  StorageKeyPRs,
} from '../../common/types';
import type { IService } from './IService';

/**
 * Interface for the storage service that handles Chrome extension storage operations.
 */
export interface IStorageService extends IService {
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
   * Last persisted GitHub web-session login (account-swap baseline).
   */
  getGitHubViewerIdentity(): Promise<GitHubViewerIdentity | null>;

  /**
   * Persists viewer login after a successful fetch cycle.
   */
  setGitHubViewerIdentity(identity: GitHubViewerIdentity): Promise<void>;

  /**
   * Clears stored viewer identity (e.g. logged out / invalid session).
   */
  clearGitHubViewerIdentity(): Promise<void>;

  /**
   * Removes GitHub-derived local data after the web session is gone: viewer identity, PR list
   * envelopes, last fetch time, and route hint. Settings and onboarding flags are untouched.
   */
  clearGitHubWebSessionCaches(): Promise<void>;

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
}

import type { IStorageService } from '../interfaces/IStorageService';
import type { IDebugService } from '../interfaces/IDebugService';
import type {
  ExtensionSettings,
  GitHubViewerIdentity,
  PullRequest,
  StorageKeyMap,
  StorageKeyPRs,
  StoredPRs,
  UserData,
} from '@common/types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
  STORAGE_KEY_ROUTE_HINT,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_USER_DATA,
} from '@common/constants';
import { isTransientExtensionStorageError } from '@common/errors';
import { runWithTransientStorageRetry } from '@common/transient-storage-retry';
import {
  DEFAULT_EXTENSION_SETTINGS,
  ensureCompleteSettings,
} from '@common/extension-settings-defaults';
import { chromeExtensionService } from '@common/chrome-extension-service';

/**
 * StorageService handles Chrome extension storage operations with validation and error handling.
 * Provides a clean abstraction over Chrome storage APIs with type safety.
 *
 * WHY [sync vs local]: `chrome.storage.sync` holds user settings (cross-device); `chrome.storage.local`
 * holds PR lists, alarm overrides, rate-limit blobs, and other device-local data. The popup reads PR
 * lists from **local** without messaging the service worker (`@common/chrome-extension-service`);
 * the background is the primary writer for those keys through this service.
 */
export class StorageService implements IStorageService {
  private debugService: IDebugService;
  private initialized = false;
  private localStorage = chromeExtensionService.storage.local;
  private syncStorage = chromeExtensionService.storage.sync;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  private logStorageException(message: string, error: unknown): void {
    if (isTransientExtensionStorageError(error)) {
      this.debugService.warn(
        message,
        'Transient chrome.storage failure (common right after sleep/wake or cold MV3 worker).',
        error
      );
    } else {
      this.debugService.error(message, error);
    }
  }

  /**
   * Initializes the storage service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize default settings if they don't exist
      const existingSettings = await this.getExtensionSettings();
      if (!existingSettings) {
        await this.setSync(STORAGE_KEY_SETTINGS, DEFAULT_EXTENSION_SETTINGS);
        this.debugService.log('[StorageService] Default settings initialized on first install');
      }

      this.initialized = true;
      this.debugService.log('[StorageService] Storage service initialized');
    } catch (error) {
      this.logStorageException('[StorageService] Failed to initialize:', error);
      throw error;
    }
  }

  // --- IStorageService Implementation ---

  /**
   * Gets stored pull requests by storage key.
   * PRs are stored in local storage (device-specific).
   */
  async getStoredPRs(
    key: StorageKeyPRs
  ): Promise<{ prs: PullRequest[]; timestamp?: number } | null> {
    try {
      const storedPRs = await this.get<StoredPRs>(key);

      if (storedPRs) {
        const result = {
          prs: storedPRs.prs || [],
          timestamp: storedPRs.lastUpdated ? new Date(storedPRs.lastUpdated).getTime() : Date.now(),
        };
        this.debugService.log(
          `[StorageService] Retrieved stored PRs for key '${key}':`,
          result.prs.length,
          'items'
        );
        return result;
      }

      return null;
    } catch (error) {
      this.logStorageException(
        `[StorageService] Error getting stored PRs for key '${key}':`,
        error
      );
      return null;
    }
  }

  /**
   * Per-key last serialized fingerprint for {@link setStoredPRs} dirty detection.
   *
   * WHY [in-memory, SW-scoped]: Lives only for this worker activation. On wake the
   * map is empty, so the first `setStoredPRs` always calls `chrome.storage.local.set`,
   * refreshing `StoredPRs.lastUpdated` for consumers that read TTL via
   * {@link getStoredPRs} (e.g. `PRService.tryTtlCachedPrList`) and for the popup’s
   * storage-driven lists (`hydratePrQueriesFromStorage`, `usePrListsStorageSync`).
   */
  private lastWrittenFingerprint = new Map<string, string>();

  /**
   * Fingerprint for comparing successive PR lists inside one worker lifetime.
   *
   * WHY [JSON.stringify]: PR payloads are plain JSON-shaped objects (avatars are
   * URLs, not inlined image data), so full-array serialization is small and keeps
   * the dirty check aligned with everything persisted to `chrome.storage.local` —
   * including fields added later on `PullRequest`, without maintaining a parallel
   * field list here. Cost stays well below a redundant `set` (structured clone + IPC).
   */
  private computePrListFingerprint(prs: PullRequest[]): string {
    // WHY [sentinel]: Fixed fingerprint for the empty list without invoking stringify.
    if (prs.length === 0) return '0';
    return JSON.stringify(prs);
  }

  /**
   * Persists `{ prs, lastUpdated }` for one of the three PR-list keys.
   *
   * WHY [skip identical payload]: `EventService.handleAlarm` refetches on a fixed
   * cadence; when GitHub returns the same list, avoiding `set` drops structured-clone
   * and IPC work. The popup listens on `chrome.storage.onChanged` — no write means no
   * spurious React Query churn when nothing changed.
   *
   * WHY [fingerprint only after successful `set`]: If `set` throws, the map is not
   * updated, so the next call retries persistence instead of treating a failed round as cached.
   */
  async setStoredPRs(key: StorageKeyPRs, prs: PullRequest[]): Promise<void> {
    try {
      const fingerprint = this.computePrListFingerprint(prs);
      if (this.lastWrittenFingerprint.get(key) === fingerprint) {
        this.debugService.log(
          `[StorageService] Skipping write for '${key}' — fingerprint unchanged (${prs.length} items)`
        );
        return;
      }

      const storedPRs: StoredPRs = {
        prs,
        lastUpdated: new Date().toISOString(),
      };
      await this.set(key, storedPRs);
      this.lastWrittenFingerprint.set(key, fingerprint);
      this.debugService.log(
        `[StorageService] Stored PRs updated for key '${key}':`,
        prs.length,
        'items'
      );
    } catch (error) {
      this.logStorageException(
        `[StorageService] Error setting stored PRs for key '${key}':`,
        error
      );
      throw error;
    }
  }

  /**
   * Gets the last fetch timestamp.
   */
  async getLastFetchTime(): Promise<number | null> {
    try {
      const timestamp = await this.get<number>(STORAGE_KEY_LAST_FETCH);
      this.debugService.log(
        '[StorageService] Last fetch time:',
        timestamp ? new Date(timestamp).toISOString() : 'never'
      );
      return timestamp;
    } catch (error) {
      this.logStorageException('[StorageService] Error getting last fetch time:', error);
      return null;
    }
  }

  /**
   * Sets the last fetch timestamp.
   */
  async setLastFetchTime(timestamp: number): Promise<void> {
    try {
      await this.set(STORAGE_KEY_LAST_FETCH, timestamp);
      this.debugService.log(
        '[StorageService] Last fetch time updated:',
        new Date(timestamp).toISOString()
      );
    } catch (error) {
      this.logStorageException('[StorageService] Error setting last fetch time:', error);
      throw error;
    }
  }

  /**
   * Gets extension settings from sync storage (cross-device).
   */
  async getExtensionSettings(): Promise<ExtensionSettings> {
    try {
      const stored = await this.getSync<ExtensionSettings>(STORAGE_KEY_SETTINGS);
      const result = ensureCompleteSettings(stored);
      this.debugService.log('[StorageService] Retrieved settings:', result);
      return result;
    } catch (error) {
      this.logStorageException('[StorageService] Error getting settings:', error);
      return DEFAULT_EXTENSION_SETTINGS;
    }
  }

  /**
   * Sets extension settings in sync storage (cross-device).
   */
  async setExtensionSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    try {
      const currentSettings = await this.getExtensionSettings();
      const updatedSettings = ensureCompleteSettings({
        ...currentSettings,
        ...settings,
      });

      await this.setSync(STORAGE_KEY_SETTINGS, updatedSettings);
      this.debugService.log('[StorageService] Settings updated:', updatedSettings);
    } catch (error) {
      this.logStorageException('[StorageService] Error setting settings:', error);
      throw error;
    }
  }

  async getGitHubViewerIdentity(): Promise<GitHubViewerIdentity | null> {
    try {
      return await this.get<GitHubViewerIdentity>(STORAGE_KEY_GITHUB_VIEWER_IDENTITY);
    } catch (error) {
      this.logStorageException('[StorageService] Error getting GitHub viewer identity:', error);
      return null;
    }
  }

  async setGitHubViewerIdentity(identity: GitHubViewerIdentity): Promise<void> {
    try {
      await this.set(STORAGE_KEY_GITHUB_VIEWER_IDENTITY, identity);
      this.debugService.log('[StorageService] GitHub viewer identity updated:', identity.login);
    } catch (error) {
      this.logStorageException('[StorageService] Error setting GitHub viewer identity:', error);
      throw error;
    }
  }

  async clearGitHubViewerIdentity(): Promise<void> {
    try {
      await this.remove(STORAGE_KEY_GITHUB_VIEWER_IDENTITY);
      this.debugService.log('[StorageService] GitHub viewer identity cleared');
    } catch (error) {
      this.logStorageException('[StorageService] Error clearing GitHub viewer identity:', error);
      throw error;
    }
  }

  /**
   * WHY [targeted wipe]: `chrome.storage.local` survives GitHub logout in the browser; leaving PR
   * payloads and `github_viewer_identity` would show another user's stale PRs after account swap
   * on the same Chrome profile. We intentionally do not clear settings or health keys.
   * WHY [reauth gate]: `onboarding_reauth_gate_pending` forces the popup welcome overlay after the
   * user signs back in, even when `has_seen_onboarding` stayed true across the wipe.
   */
  async clearGitHubWebSessionCaches(): Promise<void> {
    try {
      await this.clearGitHubViewerIdentity();
      const keys = [
        STORAGE_KEY_ASSIGNED_PRS,
        STORAGE_KEY_MERGED_PRS,
        STORAGE_KEY_AUTHORED_PRS,
        STORAGE_KEY_LAST_FETCH,
        STORAGE_KEY_ROUTE_HINT,
      ];
      await runWithTransientStorageRetry(() => this.localStorage.remove(keys));

      // WHY [fingerprint reset]: List keys were just removed from disk; fingerprints
      // still reflect pre-wipe payloads. Clearing keeps this cache coherent with
      // `chrome.storage.local` so the next `setStoredPRs` for each key performs a real `set`.
      this.lastWrittenFingerprint.clear();

      await runWithTransientStorageRetry(() =>
        this.localStorage.set({ [STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING]: true })
      );
      this.debugService.log('[StorageService] GitHub web-session caches cleared');
    } catch (error) {
      this.logStorageException('[StorageService] Error clearing GitHub web-session caches:', error);
      throw error;
    }
  }

  // --- Additional Legacy Support Methods ---

  /**
   * Gets user data.
   */
  async getUserData(): Promise<UserData | null> {
    try {
      return await this.get<UserData>(STORAGE_KEY_USER_DATA);
    } catch (error) {
      this.logStorageException('[StorageService] Error getting user data:', error);
      return null;
    }
  }

  /**
   * Sets user data.
   */
  async setUserData(userData: UserData): Promise<void> {
    try {
      await this.set(STORAGE_KEY_USER_DATA, userData);
      this.debugService.log('[StorageService] User data updated');
    } catch (error) {
      this.logStorageException('[StorageService] Error setting user data:', error);
      throw error;
    }
  }

  // --- Local Storage Methods (for PRs, device-specific data) ---

  /**
   * Gets a value from local storage by key.
   * Local storage is used for PRs and device-specific data.
   */
  async get<K extends keyof StorageKeyMap>(key: K): Promise<StorageKeyMap[K] | null>;
  async get<T>(key: string): Promise<T | null>;
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await runWithTransientStorageRetry(() => this.localStorage.get([key]));
      this.debugService.log(`[StorageService] Local storage key retrieved: '${key}'`);
      return (result[key] as T | undefined) ?? null;
    } catch (error) {
      this.logStorageException(`[StorageService] Error getting local key '${key}':`, error);
      return null;
    }
  }

  /**
   * Sets a value in local storage by key.
   * Local storage is used for PRs and device-specific data.
   */
  async set<K extends keyof StorageKeyMap>(key: K, value: StorageKeyMap[K]): Promise<void>;
  async set<T>(key: string, value: T): Promise<void>;
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await runWithTransientStorageRetry(() => this.localStorage.set({ [key]: value }));
      this.debugService.log(`[StorageService] Local storage key set: '${key}'`);
    } catch (error) {
      this.logStorageException(`[StorageService] Error setting local key '${key}':`, error);
      throw error;
    }
  }

  // --- Sync Storage Methods (for settings, cross-device) ---

  /**
   * Gets a value from sync storage by key.
   * Sync storage is used for settings that should be synchronized across devices.
   */
  private async getSync<T>(key: string): Promise<T | null> {
    try {
      const result = await runWithTransientStorageRetry(() => this.syncStorage.get([key]));
      this.debugService.log(`[StorageService] Sync storage key retrieved: '${key}'`);
      return (result[key] as T | undefined) ?? null;
    } catch (error) {
      this.logStorageException(`[StorageService] Error getting sync key '${key}':`, error);
      return null;
    }
  }

  /**
   * Sets a value in sync storage by key.
   * Sync storage is used for settings that should be synchronized across devices.
   */
  private async setSync<T>(key: string, value: T): Promise<void> {
    try {
      await runWithTransientStorageRetry(() => this.syncStorage.set({ [key]: value }));
      this.debugService.log(`[StorageService] Sync storage key set: '${key}'`);
    } catch (error) {
      this.logStorageException(`[StorageService] Error setting sync key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Removes a value from local storage by key.
   */
  async remove(key: string): Promise<void> {
    try {
      await runWithTransientStorageRetry(() => this.localStorage.remove([key]));
      // WHY [fingerprint]: Same invariant as {@link clearGitHubWebSessionCaches} — a PR-list key
      // removed outside `setStoredPRs` must not leave a stale fingerprint or the next write of
      // identical payloads would no-op while disk is empty (tests/debug helpers can call `remove` alone).
      if (this.isPrListStorageKey(key)) {
        this.lastWrittenFingerprint.delete(key);
      }
      this.debugService.log(`[StorageService] Removed local key '${key}'`);
    } catch (error) {
      this.logStorageException(`[StorageService] Error removing local key '${key}':`, error);
      throw error;
    }
  }

  private isPrListStorageKey(key: string): boolean {
    return (
      key === STORAGE_KEY_ASSIGNED_PRS ||
      key === STORAGE_KEY_MERGED_PRS ||
      key === STORAGE_KEY_AUTHORED_PRS
    );
  }

  /**
   * Gets local storage usage information.
   */
  async getStorageInfo(): Promise<{ usedBytes: number; totalBytes: number }> {
    try {
      const usedBytes = await runWithTransientStorageRetry(() => this.localStorage.getBytesInUse());
      // Chrome storage.local quota is typically 5MB
      const totalBytes = 5 * 1024 * 1024;

      this.debugService.log(
        `[StorageService] Local storage usage: ${usedBytes}/${totalBytes} bytes`
      );
      return { usedBytes, totalBytes };
    } catch (error) {
      this.logStorageException('[StorageService] Error getting storage info:', error);
      return { usedBytes: 0, totalBytes: 0 };
    }
  }

  /**
   * Disposes the storage service.
   */
  async dispose(): Promise<void> {
    this.debugService.log('[StorageService] Storage service disposed');
    this.initialized = false;
  }
}

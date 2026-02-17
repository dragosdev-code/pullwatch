import type { IStorageService } from '../interfaces/IStorageService';
import type { IDebugService } from '../interfaces/IDebugService';
import type {
  ExtensionSettings,
  PullRequest,
  StorageKeyMap,
  StorageKeyPRs,
  StoredPRs,
  UserData,
} from '../../common/types';
import {
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_USER_DATA,
} from '../../common/constants';

/**
 * StorageService handles Chrome extension storage operations with validation and error handling.
 * Provides a clean abstraction over Chrome storage APIs with type safety.
 */
export class StorageService implements IStorageService {
  private debugService: IDebugService;
  private initialized = false;
  private storage = chrome.storage.local;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  private readonly defaultSettings: ExtensionSettings = {
    notificationsEnabled: true,
    soundEnabled: true,
    fetchInterval: 60000,
  };

  /**
   * Initializes the storage service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize default settings if they don't exist
      const existingSettings = await this.getExtensionSettings();
      if (!existingSettings) {
        await this.setExtensionSettings({
          notificationsEnabled: true,
          soundEnabled: true,
          fetchInterval: 60000, // 1 minute default
        });
      }

      this.initialized = true;
      this.debugService.log('[StorageService] Storage service initialized');
    } catch (error) {
      this.debugService.error('[StorageService] Failed to initialize:', error);
      throw error;
    }
  }

  // --- IStorageService Implementation ---

  /**
   * Gets stored pull requests by storage key.
   */
  async getStoredPRs(key: StorageKeyPRs): Promise<{ prs: PullRequest[]; timestamp?: number } | null> {
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
      this.debugService.error(`[StorageService] Error getting stored PRs for key '${key}':`, error);
      return null;
    }
  }

  /**
   * Sets stored pull requests by storage key.
   */
  async setStoredPRs(
    key: StorageKeyPRs,
    prs: PullRequest[],
    options?: { filterOpenDraft?: boolean }
  ): Promise<void> {
    try {
      const normalizedPRs = options?.filterOpenDraft
        ? prs.filter((pr) => pr.type === 'open' || pr.type === 'draft')
        : prs;

      const storedPRs: StoredPRs = {
        prs: normalizedPRs,
        lastUpdated: new Date().toISOString(),
      };
      await this.set(key, storedPRs);
      this.debugService.log(
        `[StorageService] Stored PRs updated for key '${key}':`,
        normalizedPRs.length,
        'items'
      );
    } catch (error) {
      this.debugService.error(`[StorageService] Error setting stored PRs for key '${key}':`, error);
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
      this.debugService.error('[StorageService] Error getting last fetch time:', error);
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
      this.debugService.error('[StorageService] Error setting last fetch time:', error);
      throw error;
    }
  }

  /**
   * Gets extension settings.
   */
  async getExtensionSettings(): Promise<ExtensionSettings> {
    try {
      const stored = await this.get<ExtensionSettings>(STORAGE_KEY_SETTINGS);
      const result = { ...this.defaultSettings, ...(stored || {}) };
      this.debugService.log('[StorageService] Retrieved settings:', result);
      return result;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting settings:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Sets extension settings.
   */
  async setExtensionSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    try {
      const currentSettings = await this.getExtensionSettings();
      const updatedSettings = { ...currentSettings, ...settings };

      await this.set(STORAGE_KEY_SETTINGS, updatedSettings);
      this.debugService.log('[StorageService] Settings updated:', updatedSettings);
    } catch (error) {
      this.debugService.error('[StorageService] Error setting settings:', error);
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
      this.debugService.error('[StorageService] Error getting user data:', error);
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
      this.debugService.error('[StorageService] Error setting user data:', error);
      throw error;
    }
  }

  /**
   * Gets a value from storage by key.
   */
  async get<K extends keyof StorageKeyMap>(key: K): Promise<StorageKeyMap[K] | null>;
  async get<T>(key: string): Promise<T | null>;
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.storage.get([key]);
      this.debugService.log(`[StorageService] Storage key retrieved: '${key}'`);
      return (result[key] as T | undefined) ?? null;
    } catch (error) {
      this.debugService.error(`[StorageService] Error getting key '${key}':`, error);
      return null;
    }
  }

  /**
   * Sets a value in storage by key.
   */
  async set<K extends keyof StorageKeyMap>(key: K, value: StorageKeyMap[K]): Promise<void>;
  async set<T>(key: string, value: T): Promise<void>;
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.storage.set({ [key]: value });
      this.debugService.log(`[StorageService] Storage key set: '${key}'`);
    } catch (error) {
      this.debugService.error(`[StorageService] Error setting key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Removes a value from storage by key.
   */
  async remove(key: string): Promise<void> {
    try {
      await this.storage.remove([key]);
      this.debugService.log(`[StorageService] Removed key '${key}'`);
    } catch (error) {
      this.debugService.error(`[StorageService] Error removing key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Gets storage usage information.
   */
  async getStorageInfo(): Promise<{ usedBytes: number; totalBytes: number }> {
    try {
      const usedBytes = await this.storage.getBytesInUse();
      // Chrome storage.local quota is typically 5MB
      const totalBytes = 5 * 1024 * 1024;

      this.debugService.log(`[StorageService] Storage usage: ${usedBytes}/${totalBytes} bytes`);
      return { usedBytes, totalBytes };
    } catch (error) {
      this.debugService.error('[StorageService] Error getting storage info:', error);
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

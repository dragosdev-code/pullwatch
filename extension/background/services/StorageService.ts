import type { IStorageService } from '../interfaces/IStorageService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PullRequest, StorageItems, StoredPRs, UserData } from '../../common/types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
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

  // --- Generic Storage Operations ---

  /**
   * Retrieves specified items from chrome.storage.local.
   */
  async getStorageData<T extends keyof StorageItems>(
    keys: T | T[] | null = null
  ): Promise<Pick<StorageItems, T> | StorageItems> {
    try {
      const items = await this.storage.get(keys);
      this.debugService.log('[StorageService] Storage data retrieved:', keys, items);
      return items as Pick<StorageItems, T> | StorageItems;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting storage data:', error, keys);
      throw error;
    }
  }

  /**
   * Sets items in chrome.storage.local.
   */
  async setStorageData(items: Partial<StorageItems>): Promise<void> {
    try {
      await this.storage.set(items);
      this.debugService.log('[StorageService] Storage data set:', items);
    } catch (error) {
      this.debugService.error('[StorageService] Error setting storage data:', error, items);
      throw error;
    }
  }

  /**
   * Removes specified items from chrome.storage.local.
   */
  async removeStorageData(keys: string | string[]): Promise<void> {
    try {
      await this.storage.remove(keys);
      this.debugService.log('[StorageService] Storage data removed:', keys);
    } catch (error) {
      this.debugService.error('[StorageService] Error removing storage data:', error, keys);
      throw error;
    }
  }

  /**
   * Clears all items from chrome.storage.local.
   */
  async clearAllStorageData(): Promise<void> {
    try {
      await this.storage.clear();
      this.debugService.log('[StorageService] All storage data cleared.');
    } catch (error) {
      this.debugService.error('[StorageService] Error clearing all storage data:', error);
      throw error;
    }
  }

  // --- IStorageService Implementation ---

  /**
   * Gets stored assigned pull requests.
   */
  async getStoredAssignedPRs(): Promise<{ prs: PullRequest[]; timestamp?: number } | null> {
    try {
      const data = await this.getStorageData(STORAGE_KEY_ASSIGNED_PRS);
      const storedPRs = data[STORAGE_KEY_ASSIGNED_PRS] || null;

      if (storedPRs) {
        const result = {
          prs: storedPRs.prs || [],
          timestamp: storedPRs.lastUpdated ? new Date(storedPRs.lastUpdated).getTime() : Date.now(),
        };
        this.debugService.log(
          '[StorageService] Retrieved stored assigned PRs:',
          result.prs.length,
          'items'
        );
        return result;
      }

      return null;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting stored assigned PRs:', error);
      return null;
    }
  }

  /**
   * Gets stored merged pull requests.
   */
  async getStoredMergedPRs(): Promise<{ prs: PullRequest[]; timestamp?: number } | null> {
    try {
      const data = await this.getStorageData(STORAGE_KEY_MERGED_PRS);
      const storedPRs = (data as StorageItems)[STORAGE_KEY_MERGED_PRS] || null;

      if (storedPRs) {
        const result = {
          prs: storedPRs.prs || [],
          timestamp: storedPRs.lastUpdated ? new Date(storedPRs.lastUpdated).getTime() : Date.now(),
        };
        this.debugService.log(
          '[StorageService] Retrieved stored merged PRs:',
          result.prs.length,
          'items'
        );
        return result;
      }

      return null;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting stored merged PRs:', error);
      return null;
    }
  }

  /**
   * Sets stored assigned pull requests.
   * Filters out merged PRs as a safety measure — only open/draft PRs are persisted.
   */
  async setStoredAssignedPRs(prs: PullRequest[]): Promise<void> {
    try {
      const openPRs = prs.filter((pr) => pr.type === 'open' || pr.type === 'draft');
      const storedPRs: StoredPRs = {
        prs: openPRs,
        lastUpdated: new Date().toISOString(),
      };
      await this.setStorageData({ [STORAGE_KEY_ASSIGNED_PRS]: storedPRs });
      this.debugService.log(
        '[StorageService] Stored assigned PRs updated:',
        openPRs.length,
        'items'
      );
    } catch (error) {
      this.debugService.error('[StorageService] Error setting stored assigned PRs:', error);
      throw error;
    }
  }

  /**
   * Sets stored merged pull requests.
   */
  async setStoredMergedPRs(prs: PullRequest[]): Promise<void> {
    try {
      const storedPRs: StoredPRs = {
        prs,
        lastUpdated: new Date().toISOString(),
      };
      await this.setStorageData({ [STORAGE_KEY_MERGED_PRS]: storedPRs });
      this.debugService.log('[StorageService] Stored merged PRs updated:', prs.length, 'items');
    } catch (error) {
      this.debugService.error('[StorageService] Error setting stored merged PRs:', error);
      throw error;
    }
  }

  /**
   * Gets stored authored pull requests.
   */
  async getStoredAuthoredPRs(): Promise<{ prs: PullRequest[]; timestamp?: number } | null> {
    try {
      const data = await this.getStorageData(STORAGE_KEY_AUTHORED_PRS);
      const storedPRs = (data as StorageItems)[STORAGE_KEY_AUTHORED_PRS] || null;

      if (storedPRs) {
        const result = {
          prs: storedPRs.prs || [],
          timestamp: storedPRs.lastUpdated ? new Date(storedPRs.lastUpdated).getTime() : Date.now(),
        };
        this.debugService.log(
          '[StorageService] Retrieved stored authored PRs:',
          result.prs.length,
          'items'
        );
        return result;
      }

      return null;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting stored authored PRs:', error);
      return null;
    }
  }

  /**
   * Sets stored authored pull requests.
   */
  async setStoredAuthoredPRs(prs: PullRequest[]): Promise<void> {
    try {
      const storedPRs: StoredPRs = {
        prs,
        lastUpdated: new Date().toISOString(),
      };
      await this.setStorageData({ [STORAGE_KEY_AUTHORED_PRS]: storedPRs });
      this.debugService.log('[StorageService] Stored authored PRs updated:', prs.length, 'items');
    } catch (error) {
      this.debugService.error('[StorageService] Error setting stored authored PRs:', error);
      throw error;
    }
  }

  /**
   * Gets the last fetch timestamp.
   */
  async getLastFetchTime(): Promise<number | null> {
    try {
      const data = await this.getStorageData(STORAGE_KEY_LAST_FETCH);
      const timestamp = data[STORAGE_KEY_LAST_FETCH] || null;
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
      await this.setStorageData({ [STORAGE_KEY_LAST_FETCH]: timestamp });
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
  async getExtensionSettings(): Promise<{
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    fetchInterval: number;
  }> {
    try {
      const defaultSettings = {
        notificationsEnabled: true,
        soundEnabled: true,
        fetchInterval: 60000, // 1 minute
      };

      const data = await this.getStorageData(STORAGE_KEY_SETTINGS);
      const stored = data[STORAGE_KEY_SETTINGS] || defaultSettings;

      const result = { ...defaultSettings, ...stored };
      this.debugService.log('[StorageService] Retrieved settings:', result);
      return result;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting settings:', error);
      // Return default settings on error
      return {
        notificationsEnabled: true,
        soundEnabled: true,
        fetchInterval: 60000,
      };
    }
  }

  /**
   * Sets extension settings.
   */
  async setExtensionSettings(settings: {
    notificationsEnabled?: boolean;
    soundEnabled?: boolean;
    fetchInterval?: number;
  }): Promise<void> {
    try {
      const currentSettings = await this.getExtensionSettings();
      const updatedSettings = { ...currentSettings, ...settings };

      await this.setStorageData({ [STORAGE_KEY_SETTINGS]: updatedSettings });
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
      const data = await this.getStorageData(STORAGE_KEY_USER_DATA);
      return data[STORAGE_KEY_USER_DATA] || null;
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
      await this.setStorageData({ [STORAGE_KEY_USER_DATA]: userData });
      this.debugService.log('[StorageService] User data updated');
    } catch (error) {
      this.debugService.error('[StorageService] Error setting user data:', error);
      throw error;
    }
  }

  /**
   * Gets a value from storage by key.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.storage.get([key]);
      return result[key] || null;
    } catch (error) {
      this.debugService.error(`[StorageService] Error getting key '${key}':`, error);
      return null;
    }
  }

  /**
   * Sets a value in storage by key.
   */
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.storage.set({ [key]: value });
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

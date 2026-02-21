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
 * Default settings matching the UI defaults from src/components/settings/types.ts
 */
export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  assigned: {
    notificationsEnabled: true,
    notifyOnDrafts: false,
    sound: 'ping',
    showDraftsInList: true,
  },
  merged: {
    notificationsEnabled: false,
    sound: 'bell',
  },
  authored: {
    notificationsEnabled: false,
    sound: 'ping',
  },
  fetchInterval: 60000, // 1 minute default
};

/**
 * StorageService handles Chrome extension storage operations with validation and error handling.
 * Provides a clean abstraction over Chrome storage APIs with type safety.
 * Uses chrome.storage.sync for settings (cross-device) and chrome.storage.local for PRs (device-specific).
 */
export class StorageService implements IStorageService {
  private debugService: IDebugService;
  private initialized = false;
  private localStorage = chrome.storage.local;
  private syncStorage = chrome.storage.sync;

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
        await this.setSync(STORAGE_KEY_SETTINGS, DEFAULT_EXTENSION_SETTINGS);
        this.debugService.log('[StorageService] Default settings initialized on first install');
      }

      this.initialized = true;
      this.debugService.log('[StorageService] Storage service initialized');
    } catch (error) {
      this.debugService.error('[StorageService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Ensures all required settings fields exist by merging with defaults
   */
  private ensureCompleteSettings(settings: ExtensionSettings): ExtensionSettings {
    return {
      assigned: {
        ...DEFAULT_EXTENSION_SETTINGS.assigned,
        ...settings.assigned,
      },
      merged: {
        ...DEFAULT_EXTENSION_SETTINGS.merged,
        ...settings.merged,
      },
      authored: {
        ...DEFAULT_EXTENSION_SETTINGS.authored,
        ...settings.authored,
      },
      fetchInterval: settings.fetchInterval ?? DEFAULT_EXTENSION_SETTINGS.fetchInterval,
    };
  }

  // --- IStorageService Implementation ---

  /**
   * Gets stored pull requests by storage key.
   * PRs are stored in local storage (device-specific).
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
  async setStoredPRs(key: StorageKeyPRs, prs: PullRequest[]): Promise<void> {
    try {
      const storedPRs: StoredPRs = {
        prs,
        lastUpdated: new Date().toISOString(),
      };
      await this.set(key, storedPRs);
      this.debugService.log(
        `[StorageService] Stored PRs updated for key '${key}':`,
        prs.length,
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
   * Gets extension settings from sync storage (cross-device).
   */
  async getExtensionSettings(): Promise<ExtensionSettings> {
    try {
      const stored = await this.getSync<ExtensionSettings>(STORAGE_KEY_SETTINGS);
      const result = this.ensureCompleteSettings(stored || DEFAULT_EXTENSION_SETTINGS);
      this.debugService.log('[StorageService] Retrieved settings:', result);
      return result;
    } catch (error) {
      this.debugService.error('[StorageService] Error getting settings:', error);
      return DEFAULT_EXTENSION_SETTINGS;
    }
  }

  /**
   * Sets extension settings in sync storage (cross-device).
   */
  async setExtensionSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    try {
      const currentSettings = await this.getExtensionSettings();
      const updatedSettings = this.ensureCompleteSettings({
        ...currentSettings,
        ...settings,
      });

      await this.setSync(STORAGE_KEY_SETTINGS, updatedSettings);
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

  // --- Local Storage Methods (for PRs, device-specific data) ---

  /**
   * Gets a value from local storage by key.
   * Local storage is used for PRs and device-specific data.
   */
  async get<K extends keyof StorageKeyMap>(key: K): Promise<StorageKeyMap[K] | null>;
  async get<T>(key: string): Promise<T | null>;
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.localStorage.get([key]);
      this.debugService.log(`[StorageService] Local storage key retrieved: '${key}'`);
      return (result[key] as T | undefined) ?? null;
    } catch (error) {
      this.debugService.error(`[StorageService] Error getting local key '${key}':`, error);
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
      await this.localStorage.set({ [key]: value });
      this.debugService.log(`[StorageService] Local storage key set: '${key}'`);
    } catch (error) {
      this.debugService.error(`[StorageService] Error setting local key '${key}':`, error);
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
      const result = await this.syncStorage.get([key]);
      this.debugService.log(`[StorageService] Sync storage key retrieved: '${key}'`);
      return (result[key] as T | undefined) ?? null;
    } catch (error) {
      this.debugService.error(`[StorageService] Error getting sync key '${key}':`, error);
      return null;
    }
  }

  /**
   * Sets a value in sync storage by key.
   * Sync storage is used for settings that should be synchronized across devices.
   */
  private async setSync<T>(key: string, value: T): Promise<void> {
    try {
      await this.syncStorage.set({ [key]: value });
      this.debugService.log(`[StorageService] Sync storage key set: '${key}'`);
    } catch (error) {
      this.debugService.error(`[StorageService] Error setting sync key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Removes a value from local storage by key.
   */
  async remove(key: string): Promise<void> {
    try {
      await this.localStorage.remove([key]);
      this.debugService.log(`[StorageService] Removed local key '${key}'`);
    } catch (error) {
      this.debugService.error(`[StorageService] Error removing local key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Gets local storage usage information.
   */
  async getStorageInfo(): Promise<{ usedBytes: number; totalBytes: number }> {
    try {
      const usedBytes = await this.localStorage.getBytesInUse();
      // Chrome storage.local quota is typically 5MB
      const totalBytes = 5 * 1024 * 1024;

      this.debugService.log(`[StorageService] Local storage usage: ${usedBytes}/${totalBytes} bytes`);
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

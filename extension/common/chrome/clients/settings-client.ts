import { STORAGE_KEY_SETTINGS } from '../../constants';
import {
  DEFAULT_EXTENSION_SETTINGS,
  ensureCompleteSettings,
} from '../../extension-settings-defaults';
import { SETTINGS_ACTION } from '../../runtime-actions';
import { runWithTransientStorageRetry } from '../../transient-storage-retry';
import type { ExtensionSettings } from '../../types';
import type { StorageAdapter } from '../adapters/storage-adapter';
import type { StorageChangeListener } from '../chrome-types';
import { canReadSyncStorage, isExtensionContext } from '../chrome-globals';
import { subscribeWithCleanup } from '../listener-binding';
import type { BackgroundActionClient } from './background-action-client';

/**
 * Extension-settings client. Reads bypass the service worker (hot path on every popup open);
 * writes and notification tests dispatch to the background.
 */
export class SettingsClient {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly bg: BackgroundActionClient
  ) {}

  /**
   * Loads settings from `chrome.storage.sync`, applying the same merge as
   * `StorageService.getExtensionSettings` (`ensureCompleteSettings`). Returns defaults if storage
   * is unreachable so the popup can still hydrate.
   */
  async get(): Promise<ExtensionSettings> {
    if (!canReadSyncStorage()) {
      throw new Error('Extension sync storage not available');
    }
    try {
      const result = await runWithTransientStorageRetry(() =>
        this.storage.sync.get(STORAGE_KEY_SETTINGS)
      );
      return ensureCompleteSettings(result[STORAGE_KEY_SETTINGS] as ExtensionSettings | undefined);
    } catch {
      return DEFAULT_EXTENSION_SETTINGS;
    }
  }

  save(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    return this.bg.dispatch<ExtensionSettings>(SETTINGS_ACTION.saveSettings, settings);
  }

  /** Fires a sample system notification for the To Review (`assigned`) or Merged category. */
  testNotification(category: 'assigned' | 'merged'): Promise<void> {
    return this.bg.dispatch(SETTINGS_ACTION.testSettingsNotification, { category });
  }

  /**
   * Subscribes to `chrome.storage.onChanged` for the settings key (sync area). Any sync writer —
   * this extension on save, cross-device sync — triggers the same path without a runtime broadcast.
   */
  onChange(callback: (settings: ExtensionSettings) => void): () => void {
    const listener: StorageChangeListener = (changes, areaName) => {
      if (areaName !== 'sync') return;
      const change = changes[STORAGE_KEY_SETTINGS];
      if (!change?.newValue) return;
      callback(ensureCompleteSettings(change.newValue as ExtensionSettings));
    };
    return subscribeWithCleanup(this.storage.onChanged, listener, isExtensionContext);
  }
}

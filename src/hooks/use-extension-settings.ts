import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtensionSettings } from '../../extension/common/types';
import { chromeExtensionService } from '../services/chrome-extension-service';

/**
 * Hook for managing extension settings with automatic sync to Chrome storage.
 * Provides loading states, error handling, and cross-tab synchronization.
 */
export const useExtensionSettings = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Use ref to track if we're currently saving to avoid race conditions
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<Partial<ExtensionSettings> | null>(null);

  /**
   * Load settings from Chrome storage on mount
   */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const loadedSettings = await chromeExtensionService.getSettings();
        setSettings(loadedSettings);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load settings');
        setError(error);
        console.error('[useExtensionSettings] Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  /**
   * Listen for settings changes from other contexts (background, other tabs)
   */
  useEffect(() => {
    const unsubscribe = chromeExtensionService.onSettingsChange((newSettings) => {
      // Only update if we're not currently saving to avoid overwriting pending changes
      if (!isSavingRef.current) {
        setSettings(newSettings);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Save settings to Chrome storage
   */
  const saveSettings = useCallback(async (newSettings: Partial<ExtensionSettings>) => {
    try {
      // If already saving, queue this save for after the current one completes
      if (isSavingRef.current) {
        pendingSaveRef.current = { ...pendingSaveRef.current, ...newSettings };
        return;
      }

      isSavingRef.current = true;
      setIsSaving(true);

      // Optimistically update local state for immediate UI feedback
      setSettings((prev) => (prev ? { ...prev, ...newSettings } : null));

      // Send to background script for persistence
      const savedSettings = await chromeExtensionService.saveSettings(newSettings);

      // Update with confirmed settings from server
      setSettings(savedSettings);
      setError(null);

      // Process any pending saves that accumulated during this save
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;

      if (pending) {
        isSavingRef.current = false;
        await saveSettings(pending);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save settings');
      setError(error);
      console.error('[useExtensionSettings] Failed to save settings:', error);

      // Revert to last known good settings on error
      try {
        const currentSettings = await chromeExtensionService.getSettings();
        setSettings(currentSettings);
      } catch {
        // If we can't even get settings, we're in a bad state
      }
    } finally {
      if (!pendingSaveRef.current) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    saveSettings,
  };
};

export default useExtensionSettings;

import { useEffect } from 'react';
import { useSetGlobalError } from '../stores/global-error';
import { useDebugMode, useDebugStore } from '../stores/debug';
import { chromeExtensionService } from '@common/chrome-extension-service';

/**
 * Hook to synchronize Zustand store with Chrome storage
 * Handles loading initial state and saving changes
 */
export const useStorageSync = () => {
  const debugMode = useDebugMode();
  const setGlobalError = useSetGlobalError();

  // Load debug mode from Chrome storage on mount
  useEffect(() => {
    const loadDebugState = async () => {
      try {
        if (chromeExtensionService.isExtensionContext()) {
          const result = await chromeExtensionService.storage.local.get('pr-extension-debug-mode');
          const savedDebugMode = result['pr-extension-debug-mode'] || false;

          if (savedDebugMode !== debugMode) {
            useDebugStore.getState().setDebugMode(Boolean(savedDebugMode));
          }
        }
      } catch (error) {
        console.warn('Failed to load debug state from Chrome storage:', error);
      }
    };

    loadDebugState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save debug mode to Chrome storage when it changes
  useEffect(() => {
    const saveDebugState = async () => {
      try {
        if (chromeExtensionService.isExtensionContext()) {
          await chromeExtensionService.storage.local.set({ 'pr-extension-debug-mode': debugMode });
        }
      } catch (error) {
        console.warn('Failed to save debug state to Chrome storage:', error);
        setGlobalError('Failed to save settings');
      }
    };

    saveDebugState();
  }, [debugMode, setGlobalError]); // Run when debug mode changes
};

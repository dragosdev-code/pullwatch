import { useCallback, useEffect, useState } from 'react';
import { isExtensionContext } from '../utils/is-extension-context';

export type LinkOpenBehavior = 'foreground' | 'background';

const STORAGE_KEY = 'pr-extension-link-behavior';
const DEFAULT_BEHAVIOR: LinkOpenBehavior = 'foreground';

export const useLinkBehavior = () => {
  const [behavior, setBehaviorState] = useState<LinkOpenBehavior>(DEFAULT_BEHAVIOR);

  useEffect(() => {
    const loadBehavior = async () => {
      try {
        let saved: LinkOpenBehavior | undefined;

        if (isExtensionContext()) {
          const result = await chrome.storage.sync.get(STORAGE_KEY);
          saved = result[STORAGE_KEY] as LinkOpenBehavior | undefined;
        }

        if (!saved) {
          saved = localStorage.getItem(STORAGE_KEY) as LinkOpenBehavior | null || DEFAULT_BEHAVIOR;
        }

        const validBehavior = saved === 'background' ? 'background' : 'foreground';
        setBehaviorState(validBehavior);
      } catch {
        setBehaviorState(DEFAULT_BEHAVIOR);
      }
    };

    loadBehavior();

    // Sync across all hook instances when storage changes
    if (isExtensionContext()) {
      const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'sync' && changes[STORAGE_KEY]) {
          const newValue = changes[STORAGE_KEY].newValue as LinkOpenBehavior | undefined;
          setBehaviorState(newValue === 'background' ? 'background' : 'foreground');
        }
      };

      chrome.storage.onChanged.addListener(onStorageChanged);
      return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    }
  }, []);

  const setBehavior = useCallback(async (newBehavior: LinkOpenBehavior) => {
    setBehaviorState(newBehavior);
    localStorage.setItem(STORAGE_KEY, newBehavior);

    try {
      if (isExtensionContext()) {
        await chrome.storage.sync.set({ [STORAGE_KEY]: newBehavior });
      }
    } catch {
      console.warn('Failed to persist link behavior to Chrome storage');
    }
  }, []);

  return { behavior, setBehavior };
};

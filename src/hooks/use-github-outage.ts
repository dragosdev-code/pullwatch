import { useEffect, useState } from 'react';
import { BROADCAST_ACTION } from '../../extension/common/runtime-actions';
import { STORAGE_KEY_GITHUB_OUTAGE } from '../../extension/common/constants';
import { chromeExtensionService } from '../services/chrome-extension-service';

/**
 * Reads the GitHub-outage flag from chrome.storage.local on mount and
 * listens for real-time broadcast updates via chromeExtensionService.
 * Returns `true` when the background service detected a transient GitHub
 * failure (5xx, network timeout, etc.) — distinct from a parser breakage
 * which signals a DOM change.
 */
export function useGitHubOutage(): boolean {
  const [outage, setOutage] = useState(false);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    chrome.storage.local.get(STORAGE_KEY_GITHUB_OUTAGE).then((result) => {
      setOutage(!!result[STORAGE_KEY_GITHUB_OUTAGE]);
    });

    const cleanupMessage = chromeExtensionService.onMessage((message) => {
      if (message.action === BROADCAST_ACTION.githubOutageDetected) {
        setOutage(true);
      } else if (message.action === BROADCAST_ACTION.githubOutageCleared) {
        setOutage(false);
      }
    });

    const onStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !(STORAGE_KEY_GITHUB_OUTAGE in changes)) return;
      setOutage(!!changes[STORAGE_KEY_GITHUB_OUTAGE].newValue);
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cleanupMessage();
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return outage;
}

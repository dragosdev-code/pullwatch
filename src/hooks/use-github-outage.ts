import { useEffect, useState } from 'react';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import {
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
} from '@common/constants';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';

export type GitHubOutageUiState = {
  /** True while `STORAGE_KEY_GITHUB_OUTAGE` is set (transport or PR-component gate). */
  isActive: boolean;
  /**
   * Present when the outage gate recorded an empty fetch it refused to apply; cleared together with
   * the outage flag when the background reports recovery.
   */
  lastUntrustedAttemptAt: number | null;
};

function readUntrustedMs(result: Record<string, unknown>): number | null {
  const raw = result[STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Subscribes to the GitHub-outage flag and optional “untrusted empty fetch” timestamp in
 * chrome.storage.local, plus broadcast updates from the service worker.
 *
 * WHY [two fields]: Transport failures never write {@link STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT};
 * only the PRService gate does — so the banner can show an extra line only when we attempted a
 * sync but kept the cached list.
 */
export function useGitHubOutage(): GitHubOutageUiState {
  const [isActive, setIsActive] = useState(false);
  const [lastUntrustedAttemptAt, setLastUntrustedAttemptAt] = useState<number | null>(null);

  useEffect(() => {
    if (!chromeExtensionService.isExtensionContext()) return;

    chromeExtensionService.storage.local
      .get([STORAGE_KEY_GITHUB_OUTAGE, STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT])
      .then((result) => {
        setIsActive(!!result[STORAGE_KEY_GITHUB_OUTAGE]);
        setLastUntrustedAttemptAt(readUntrustedMs(result));
      });

    const cleanupMessage = chromeExtensionService.messages.subscribe((message) => {
      if (message.action === BROADCAST_ACTION.githubOutageDetected) {
        setIsActive(true);
      } else if (message.action === BROADCAST_ACTION.githubOutageCleared) {
        setIsActive(false);
        setLastUntrustedAttemptAt(null);
      }
    });

    const onStorageChanged = (
      changes: { [key: string]: StorageChange },
      area: string,
    ) => {
      if (area !== 'local') return;
      if (STORAGE_KEY_GITHUB_OUTAGE in changes) {
        setIsActive(!!changes[STORAGE_KEY_GITHUB_OUTAGE].newValue);
      }
      if (STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT in changes) {
        const nv = changes[STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT].newValue;
        setLastUntrustedAttemptAt(
          typeof nv === 'number' && Number.isFinite(nv) ? nv : null
        );
      }
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cleanupMessage();
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return { isActive, lastUntrustedAttemptAt };
}

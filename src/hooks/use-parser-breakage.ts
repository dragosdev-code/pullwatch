import { useEffect, useState } from 'react';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import { STORAGE_KEY_PARSER_BREAKAGE } from '@common/constants';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';

/**
 * Reads the parser-breakage flag from chrome.storage.local on mount and
 * listens for real-time broadcast updates via chromeExtensionService.
 * Returns `true` when the scraper has detected a GitHub DOM change that
 * prevents parsing.
 */
export function useParserBreakage(): boolean {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!chromeExtensionService.isExtensionContext()) return;

    chromeExtensionService.storage.local.get(STORAGE_KEY_PARSER_BREAKAGE).then((result) => {
      setBroken(!!result[STORAGE_KEY_PARSER_BREAKAGE]);
    });

    const cleanupMessage = chromeExtensionService.onMessage((message) => {
      if (message.action === BROADCAST_ACTION.parserBreakageDetected) {
        setBroken(true);
      } else if (message.action === BROADCAST_ACTION.parserBreakageCleared) {
        setBroken(false);
      }
    });

    const onStorageChanged = (
      changes: { [key: string]: StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !(STORAGE_KEY_PARSER_BREAKAGE in changes)) return;
      setBroken(!!changes[STORAGE_KEY_PARSER_BREAKAGE].newValue);
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cleanupMessage();
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return broken;
}

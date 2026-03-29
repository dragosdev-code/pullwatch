import { useEffect, useState } from 'react';
import { BROADCAST_ACTION } from '../../extension/common/runtime-actions';
import { STORAGE_KEY_PARSER_BREAKAGE } from '../../extension/common/constants';
import { chromeExtensionService } from '../services/chrome-extension-service';

/**
 * Reads the parser-breakage flag from chrome.storage.local on mount and
 * listens for real-time broadcast updates via chromeExtensionService.
 * Returns `true` when the scraper has detected a GitHub DOM change that
 * prevents parsing.
 */
export function useParserBreakage(): boolean {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    chrome.storage.local.get(STORAGE_KEY_PARSER_BREAKAGE).then((result) => {
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
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local' || !(STORAGE_KEY_PARSER_BREAKAGE in changes)) return;
      setBroken(!!changes[STORAGE_KEY_PARSER_BREAKAGE].newValue);
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cleanupMessage();
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return broken;
}

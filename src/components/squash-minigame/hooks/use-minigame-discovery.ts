import { useEffect, useState } from 'react';
import { MINIGAME_DISCOVERY_THRESHOLD, STORAGE_KEY_MINIGAME_STATS } from '@common/constants';
import { chromeExtensionService, type StorageChange } from '@common/chrome-extension-service';
import type { MinigameStats } from '@common/types';
import { isExtensionContext } from '@src/utils/is-extension-context';
import { ensureCompleteMinigameStats } from '../storage/minigame-stats-defaults';
import { readMinigameStats, writeMinigameStats } from '../storage/minigame-stats-storage';

/**
 * Module scope flag that survives StrictMode double mount (which fires effects twice in dev).
 * Chrome popups recreate the document on each open, so module state is fresh per popup launch
 * and the counter still ticks exactly once per real open.
 */
let popupIncrementCommitted = false;

export interface UseMinigameDiscoveryResult {
  stats: MinigameStats | null;
  ready: boolean;
}

/**
 * Hydrates {@link MinigameStats} from chrome.storage.local on popup mount, increments
 * `popupOpenCount` exactly once per popup open, and flips `hasDiscovered` to `true` on the
 * {@link MINIGAME_DISCOVERY_THRESHOLD}th open.
 *
 * Outside a real extension context (plain Vite dev), the hook hydrates defaults and skips
 * the write so devtools sessions do not pollute counts.
 */
export function useMinigameDiscovery(): UseMinigameDiscoveryResult {
  const [stats, setStats] = useState<MinigameStats | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isExtensionContext()) {
      setStats(ensureCompleteMinigameStats(undefined));
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    const hydrateAndIncrement = async () => {
      try {
        const current = await readMinigameStats();
        if (cancelled) return;

        if (popupIncrementCommitted) {
          setStats(current);
          setReady(true);
          return;
        }

        popupIncrementCommitted = true;

        const nextCount = current.popupOpenCount + 1;
        const next: MinigameStats = {
          ...current,
          popupOpenCount: nextCount,
          hasDiscovered: current.hasDiscovered || nextCount >= MINIGAME_DISCOVERY_THRESHOLD,
        };

        try {
          await writeMinigameStats(next);
        } catch {
          /* swallow: a failed write must not block the popup booting */
        }

        if (!cancelled) {
          setStats(next);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setStats(ensureCompleteMinigameStats(undefined));
          setReady(true);
        }
      }
    };

    void hydrateAndIncrement();

    const onStorageChanged = (changes: { [key: string]: StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (!(STORAGE_KEY_MINIGAME_STATS in changes)) return;
      const newValue = changes[STORAGE_KEY_MINIGAME_STATS].newValue as
        | Partial<MinigameStats>
        | undefined;
      setStats(ensureCompleteMinigameStats(newValue));
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);

    return () => {
      cancelled = true;
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return { stats, ready };
}

/** Test only: resets the module scoped guard so tests can simulate fresh popup opens. */
export function __resetMinigameDiscoveryForTests(): void {
  popupIncrementCommitted = false;
}

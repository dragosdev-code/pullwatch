import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEY_MINIGAME_STATS } from '@common/constants';
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
  /** Persists `hasDiscovered: true` (header CTA / launcher opt-in); idempotent if already set. */
  discoverMinigame: () => Promise<void>;
}

/**
 * Hydrates {@link MinigameStats} from chrome.storage.local on popup mount and increments
 * `popupOpenCount` exactly once per popup open.
 *
 * WHY [threshold does not set hasDiscovered]: popup open count still tracks toward the **CTA**;
 * {@link discoverMinigame} is the sole path that flips `hasDiscovered` so Settings stays gated
 * until explicit user opt-in.
 *
 * Outside a real extension context (plain Vite dev), the hook hydrates defaults and skips
 * the write so devtools sessions do not pollute counts.
 */
export function useMinigameDiscovery(): UseMinigameDiscoveryResult {
  const [stats, setStats] = useState<MinigameStats | null>(null);
  const [ready, setReady] = useState(false);

  const discoverMinigame = useCallback(async () => {
    if (!isExtensionContext()) {
      setStats((prev) => {
        const base = prev ?? ensureCompleteMinigameStats(undefined);
        return { ...base, hasDiscovered: true };
      });
      return;
    }

    try {
      const current = await readMinigameStats();
      if (current.hasDiscovered) {
        setStats(current);
        return;
      }
      const next: MinigameStats = { ...current, hasDiscovered: true };
      try {
        await writeMinigameStats(next);
      } catch {
        /* swallow: a failed write must not strand the UI on an intentional unlock */
      }
      setStats(next);
    } catch {
      setStats((prev) => {
        const base = prev ?? ensureCompleteMinigameStats(undefined);
        return { ...base, hasDiscovered: true };
      });
    }
  }, []);

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
          // WHY: threshold only gates the header CTA; `discoverMinigame` owns the flip.
          hasDiscovered: current.hasDiscovered,
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

  return { stats, ready, discoverMinigame };
}

/** Test only: resets the module scoped guard so tests can simulate fresh popup opens. */
export function __resetMinigameDiscoveryForTests(): void {
  popupIncrementCommitted = false;
}

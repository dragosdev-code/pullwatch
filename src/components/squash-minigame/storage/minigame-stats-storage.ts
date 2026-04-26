import { STORAGE_KEY_MINIGAME_STATS } from '@common/constants';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { runWithTransientStorageRetry } from '@common/transient-storage-retry';
import type { MinigameStats } from '@common/types';
import { ensureCompleteMinigameStats } from './minigame-stats-defaults';

/**
 * Reads the persisted MinigameStats blob from chrome.storage.local and returns a fully populated
 * object. Missing or corrupt storage falls back to defaults so callers can always treat the
 * return value as ready to render.
 */
export async function readMinigameStats(): Promise<MinigameStats> {
  try {
    const result = await runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.get([STORAGE_KEY_MINIGAME_STATS])
    );
    const stored = result[STORAGE_KEY_MINIGAME_STATS] as Partial<MinigameStats> | undefined;
    return ensureCompleteMinigameStats(stored);
  } catch {
    return ensureCompleteMinigameStats(undefined);
  }
}

/**
 * Persists the full MinigameStats blob to chrome.storage.local.
 *
 * WHY [single key write]: the blob is small and self-contained, so one atomic write keeps
 * counters and `hasDiscovered` consistent without cross-key sequencing.
 */
export async function writeMinigameStats(stats: MinigameStats): Promise<void> {
  await runWithTransientStorageRetry(() =>
    chromeExtensionService.storage.local.set({ [STORAGE_KEY_MINIGAME_STATS]: stats })
  );
}

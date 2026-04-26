import { STORAGE_KEY_MINIGAME_SESSION_CHECKPOINT } from '@common/constants';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { runWithTransientStorageRetry } from '@common/transient-storage-retry';
import type { MinigameSessionCheckpoint } from '@common/types';

/**
 * Read the persisted session checkpoint from chrome.storage.local.
 * Returns `null` if none exists or if the stored value is corrupt/missing required fields.
 *
 * WHY [defensive validation]: unlike MinigameStats (which has ensureComplete defaults), a
 * checkpoint with missing fields is dangerous to resume from — better to start fresh.
 */
export async function readSessionCheckpoint(): Promise<MinigameSessionCheckpoint | null> {
  try {
    const result = await runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.get([STORAGE_KEY_MINIGAME_SESSION_CHECKPOINT])
    );
    const stored = result[STORAGE_KEY_MINIGAME_SESSION_CHECKPOINT];
    if (!stored || typeof stored !== 'object') return null;

    const cp = stored as Partial<MinigameSessionCheckpoint>;
    if (
      typeof cp.mode !== 'string' ||
      typeof cp.score !== 'number' ||
      typeof cp.combo !== 'number' ||
      typeof cp.highestCombo !== 'number' ||
      typeof cp.bugsSquashed !== 'number' ||
      typeof cp.featuresBroken !== 'number' ||
      typeof cp.elapsedMs !== 'number' ||
      typeof cp.timeRemainingMs !== 'number' ||
      typeof cp.gridSize !== 'number' ||
      typeof cp.savedAt !== 'number'
    ) {
      return null;
    }
    return cp as MinigameSessionCheckpoint;
  } catch {
    return null;
  }
}

/**
 * Persist a session checkpoint to chrome.storage.local.
 * Errors are swallowed — a failed save simply means the round cannot be resumed.
 */
export async function writeSessionCheckpoint(cp: MinigameSessionCheckpoint): Promise<void> {
  try {
    await runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.set({
        [STORAGE_KEY_MINIGAME_SESSION_CHECKPOINT]: cp,
      })
    );
  } catch {
    /* non-critical: round continues normally, just cannot resume after popup close */
  }
}

/**
 * Clear the session checkpoint from storage. Called on round finish and explicit exit.
 */
export async function clearSessionCheckpoint(): Promise<void> {
  try {
    await runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.remove([STORAGE_KEY_MINIGAME_SESSION_CHECKPOINT])
    );
  } catch {
    /* non-critical */
  }
}

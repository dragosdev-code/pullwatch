import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../../constants';
import { PR_DATA_ACTION } from '../../runtime-actions';
import { runWithTransientStorageRetry } from '../../transient-storage-retry';
import type { PullRequest, StoredPRs } from '../../types';
import type { StorageAdapter } from '../adapters/storage-adapter';
import { canReadLocalStorage } from '../chrome-globals';
import type { BackgroundActionClient } from './background-action-client';

/**
 * PR-list reads from `chrome.storage.local` (snapshot reads, no service-worker wake) and
 * user-initiated refresh dispatches to the background service worker.
 */
export class PrClient {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly bg: BackgroundActionClient
  ) {}

  /** Snapshot for React Query; does not call the background. */
  readAssignedFromLocal(): Promise<PullRequest[]> {
    return this.readFromLocal(STORAGE_KEY_ASSIGNED_PRS);
  }

  readMergedFromLocal(): Promise<PullRequest[]> {
    return this.readFromLocal(STORAGE_KEY_MERGED_PRS);
  }

  readAuthoredFromLocal(): Promise<PullRequest[]> {
    return this.readFromLocal(STORAGE_KEY_AUTHORED_PRS);
  }

  /** User-initiated refresh: background fetches GitHub, updates storage, reschedules the alarm. */
  fetchFreshAssigned(): Promise<PullRequest[]> {
    return this.bg.dispatch<PullRequest[]>(PR_DATA_ACTION.fetchAssignedPRs);
  }

  fetchFreshMerged(): Promise<PullRequest[]> {
    return this.bg.dispatch<PullRequest[]>(PR_DATA_ACTION.fetchMergedPRs);
  }

  fetchFreshAuthored(): Promise<PullRequest[]> {
    return this.bg.dispatch<PullRequest[]>(PR_DATA_ACTION.fetchAuthoredPRs);
  }

  private async readFromLocal(storageKey: string): Promise<PullRequest[]> {
    if (!canReadLocalStorage()) {
      throw new Error('Extension local storage not available');
    }
    const result = await runWithTransientStorageRetry(() => this.storage.local.get(storageKey));
    return (result[storageKey] as StoredPRs | undefined)?.prs ?? [];
  }
}

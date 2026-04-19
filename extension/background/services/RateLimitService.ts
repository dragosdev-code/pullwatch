import type { IRateLimitService, RateLimitState } from '../interfaces/IRateLimitService';
import type { IDebugService } from '../interfaces/IDebugService';
import {
  FETCH_INTERVAL_MS,
  RATE_LIMIT_MAX_BACKOFF_MS,
  STORAGE_KEY_RATE_LIMIT,
} from '../../common/constants';

/**
 * Tracks GitHub rate limit (429) state and enforces exponential backoff.
 * State is kept in memory and persisted to chrome.storage.local so it
 * survives service-worker restarts.
 */
export class RateLimitService implements IRateLimitService {
  private debugService: IDebugService;
  private state: RateLimitState = {
    isLimited: false,
    retryAfterTimestamp: null,
    consecutiveHits: 0,
    lastHitTimestamp: null,
  };

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  async initialize(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_RATE_LIMIT);
      const persisted = result[STORAGE_KEY_RATE_LIMIT] as RateLimitState | undefined;
      if (persisted) {
        this.state = persisted;
        this.debugService.log('[RateLimitService] Restored persisted state:', this.state);
      }
    } catch {
      this.debugService.log('[RateLimitService] No persisted state found, starting fresh');
    }
    this.debugService.log('[RateLimitService] Initialized');
  }

  recordRateLimitHit(retryAfterSeconds = 0): void {
    this.state.consecutiveHits += 1;
    this.state.lastHitTimestamp = Date.now();
    this.state.isLimited = true;

    // Backoff = max(retryAfter header, exponential backoff based on consecutive hits)
    const exponentialBackoffMs = Math.min(
      FETCH_INTERVAL_MS * Math.pow(2, this.state.consecutiveHits - 1),
      RATE_LIMIT_MAX_BACKOFF_MS
    );
    const retryAfterMs = retryAfterSeconds * 1000;
    const backoffMs = Math.max(retryAfterMs, exponentialBackoffMs);

    this.state.retryAfterTimestamp = Date.now() + backoffMs;

    this.debugService.log(
      `[RateLimitService] Rate limit hit #${this.state.consecutiveHits}. ` +
        `Backoff: ${Math.round(backoffMs / 1000)}s (retry-after header: ${retryAfterSeconds}s, ` +
        `exponential: ${Math.round(exponentialBackoffMs / 1000)}s). ` +
        `Next fetch eligible at ${new Date(this.state.retryAfterTimestamp).toISOString()}`
    );

    this.persist();
  }

  recordSuccess(): void {
    if (this.state.consecutiveHits === 0 && !this.state.isLimited) return;

    this.debugService.log(
      `[RateLimitService] Successful fetch after ${this.state.consecutiveHits} consecutive hit(s). Resetting backoff.`
    );

    this.state = {
      isLimited: false,
      retryAfterTimestamp: null,
      consecutiveHits: 0,
      lastHitTimestamp: null,
    };
    this.persist();
  }

  shouldSkipFetch(): boolean {
    if (!this.state.isLimited || this.state.retryAfterTimestamp === null) {
      return false;
    }

    if (Date.now() >= this.state.retryAfterTimestamp) {
      this.debugService.log('[RateLimitService] Backoff period expired, allowing fetch');
      return false;
    }

    const remainingMs = this.state.retryAfterTimestamp - Date.now();
    this.debugService.log(
      `[RateLimitService] Fetch skipped – backoff active for ${Math.round(remainingMs / 1000)}s more`
    );
    return true;
  }

  getState(): RateLimitState {
    const snapshot = { ...this.state };
    // WHY [derive isLimited for observers]: Internal `isLimited` stays true until recordSuccess()
    // so `shouldSkipFetch` and persistence share one object; callers of getState() need the same
    // notion of "in backoff" as shouldSkipFetch — false once `retryAfterTimestamp` has passed, even
    // before a successful fetch clears the stored counters.
    snapshot.isLimited =
      snapshot.retryAfterTimestamp !== null && Date.now() < snapshot.retryAfterTimestamp;
    return snapshot;
  }

  async dispose(): Promise<void> {
    await this.persist();
    this.debugService.log('[RateLimitService] Disposed');
  }

  private async persist(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_RATE_LIMIT]: this.state });
    } catch (error) {
      this.debugService.error('[RateLimitService] Failed to persist state:', error);
    }
  }
}

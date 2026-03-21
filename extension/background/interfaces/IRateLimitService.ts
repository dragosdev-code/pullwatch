export interface RateLimitState {
  isLimited: boolean;
  retryAfterTimestamp: number | null;
  consecutiveHits: number;
  lastHitTimestamp: number | null;
}

/**
 * Interface for tracking GitHub rate limit state and enforcing backoff.
 */
export interface IRateLimitService {
  initialize(): Promise<void>;

  /**
   * Records a 429 rate limit response. Increases backoff duration exponentially.
   * @param retryAfterSeconds - Value from the Retry-After header, if present.
   */
  recordRateLimitHit(retryAfterSeconds?: number): void;

  /**
   * Records a successful fetch. Resets the backoff counter.
   */
  recordSuccess(): void;

  /**
   * Returns true if the extension should skip fetching due to active backoff.
   */
  shouldSkipFetch(): boolean;

  /**
   * Returns the current rate limit state for debugging.
   */
  getState(): RateLimitState;

  dispose(): Promise<void>;
}

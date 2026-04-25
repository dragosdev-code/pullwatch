/**
 * {@link RateLimitService.getState} — `isLimited` tracks the live backoff window, not only the
 * persisted flag cleared on {@link RateLimitService.recordSuccess}.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitService } from '../RateLimitService';
import type { IDebugService } from '../../interfaces/IDebugService';
import { FETCH_INTERVAL_MS } from '@common/constants';

describe.sequential('RateLimitService getState', () => {
  const debugService: IDebugService = {
    initialize: vi.fn(),
    dispose: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

    vi.stubGlobal(
      'chrome',
      {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
          },
        },
      } as unknown as (typeof globalThis)['chrome']
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports isLimited true while inside the backoff window', () => {
    const svc = new RateLimitService(debugService);
    svc.recordRateLimitHit(0);

    expect(svc.getState().isLimited).toBe(true);
    expect(svc.getState().retryAfterTimestamp).not.toBeNull();
  });

  it('reports isLimited false after retryAfterTimestamp even if recordSuccess was not called yet', () => {
    const svc = new RateLimitService(debugService);
    svc.recordRateLimitHit(0);

    const until = svc.getState().retryAfterTimestamp!;
    vi.setSystemTime(until);
    expect(svc.shouldSkipFetch()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(svc.getState().isLimited).toBe(false);
    expect(svc.shouldSkipFetch()).toBe(false);
  });

  it('aligns getState().isLimited with shouldSkipFetch for the same clock', () => {
    const svc = new RateLimitService(debugService);
    svc.recordRateLimitHit(0);

    const mid = FETCH_INTERVAL_MS / 2;
    vi.advanceTimersByTime(mid);
    expect(svc.shouldSkipFetch()).toBe(svc.getState().isLimited);

    vi.advanceTimersByTime(FETCH_INTERVAL_MS);
    expect(svc.shouldSkipFetch()).toBe(false);
    expect(svc.getState().isLimited).toBe(false);
  });

  it('reports isLimited false after recordSuccess', () => {
    const svc = new RateLimitService(debugService);
    svc.recordRateLimitHit(60);
    svc.recordSuccess();

    expect(svc.getState().isLimited).toBe(false);
    expect(svc.getState().retryAfterTimestamp).toBeNull();
  });
});

/**
 * Barrier tests for parallel manual PR refresh (assigned + merged + authored).
 *
 * WHY [deferred mocks]: Popup refresh sends three runtime messages; we must overlap handlers and
 * resolve GitHub work in a test-chosen order—wall-clock delays would flake. Mirrors production pressure
 * on {@link EventService}'s private `withPrUiFetchIndicator` (see `EventService.ts`).
 *
 * WHY [microtask drain]: `async`/`finally` in that wrapper plus mocked `await persist` / `await storage.set`
 * schedule continuations as microtasks; a bounded `Promise.resolve` loop drains them before assertions
 * without fake timers (which fight native Promises in Vitest).
 *
 * WHY [depth cast]: `prUiFetchDepth` stays private; we only read it here to assert the re-entrancy barrier,
 * not to widen production API.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventService } from '../EventService';
import type { ServiceContainer } from '../../core/ServiceContainer';
import type { ServiceMap } from '../../core/ServiceMap';
import type { IPRService } from '../../interfaces/IPRService';
import type { IStorageService } from '../../interfaces/IStorageService';
import type { IAlarmService } from '../../interfaces/IAlarmService';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { MessageResponse, PullRequest, RuntimeRequestMessage } from '../../../common/types';
import { STORAGE_KEY_PR_FETCH_IN_PROGRESS } from '../../../common/constants';
import { PR_DATA_ACTION } from '../../../common/runtime-actions';

/** Same contract as `Promise.withResolvers` without raising TS `lib` past ES2020. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function getPrUiFetchDepth(eventService: EventService): number {
  return (eventService as unknown as { prUiFetchDepth: number }).prUiFetchDepth;
}

async function drainMicrotasks(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe.sequential('EventService manual PR fetch barrier (withPrUiFetchIndicator)', () => {
  let eventService: EventService;
  let persistResolvedViewerIdentity: Mock<() => Promise<void>>;
  let fetchAssigned: Mock<(forceRefresh?: boolean) => Promise<PullRequest[]>>;
  let updateMerged: Mock<(forceRefresh?: boolean) => Promise<PullRequest[]>>;
  let updateAuthored: Mock<(forceRefresh?: boolean) => Promise<PullRequest[]>>;
  let prFetchInProgress: boolean | undefined;
  let storageSet: Mock;

  let resolveAssigned: (value: PullRequest[] | PromiseLike<PullRequest[]>) => void;
  let resolveMerged: (value: PullRequest[] | PromiseLike<PullRequest[]>) => void;
  let resolveAuthored: (value: PullRequest[] | PromiseLike<PullRequest[]>) => void;

  const debugService: IDebugService = {
    initialize: vi.fn(),
    dispose: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'chrome',
      {
        storage: {
          session: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
          },
        },
      } as unknown as (typeof globalThis)['chrome']
    );
    prFetchInProgress = undefined;

    const dAssigned = createDeferred<PullRequest[]>();
    const dMerged = createDeferred<PullRequest[]>();
    const dAuthored = createDeferred<PullRequest[]>();
    resolveAssigned = dAssigned.resolve;
    resolveMerged = dMerged.resolve;
    resolveAuthored = dAuthored.resolve;

    persistResolvedViewerIdentity = vi.fn().mockResolvedValue(undefined);
    fetchAssigned = vi.fn().mockReturnValue(dAssigned.promise);
    updateMerged = vi.fn().mockReturnValue(dMerged.promise);
    updateAuthored = vi.fn().mockReturnValue(dAuthored.promise);

    const prService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      fetchAndUpdateAssignedPRs: fetchAssigned,
      updateMergedPRs: updateMerged,
      updateAuthoredPRs: updateAuthored,
      persistResolvedViewerIdentity,
    } as unknown as IPRService;

    storageSet = vi.fn(async (key: string, value: unknown) => {
      if (key === STORAGE_KEY_PR_FETCH_IN_PROGRESS) {
        prFetchInProgress = value as boolean;
      }
    });

    const storageService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      set: storageSet,
    } as unknown as IStorageService;

    const alarmService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      rescheduleFetchAlarmFromNow: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAlarmService;

    const fakeContainer: Pick<ServiceContainer, 'getService'> = {
      getService<K extends keyof ServiceMap>(key: K): ServiceMap[K] {
        switch (key) {
          case 'debugService':
            return debugService as ServiceMap[K];
          case 'prService':
            return prService as ServiceMap[K];
          case 'storageService':
            return storageService as ServiceMap[K];
          case 'alarmService':
            return alarmService as ServiceMap[K];
          default:
            throw new Error(`Unexpected getService key in test: ${String(key)}`);
        }
      },
    };

    eventService = new EventService(debugService, fakeContainer as ServiceContainer);
  });

  it('coalesces parallel manual fetches: persist runs once after depth 0; storage flag matches barrier', async () => {
    expect.assertions(16);

    const sendResponse = vi.fn();
    const empty: PullRequest[] = [];

    const msgAssigned = { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage;
    const msgMerged = { action: PR_DATA_ACTION.fetchMergedPRs } satisfies RuntimeRequestMessage;
    const msgAuthored = { action: PR_DATA_ACTION.fetchAuthoredPRs } satisfies RuntimeRequestMessage;

    const pAssigned = eventService.handleAssignedPRDataActions(
      msgAssigned,
      sendResponse as (r: MessageResponse) => void
    );
    const pMerged = eventService.handleMergedPRDataActions(
      msgMerged,
      sendResponse as (r: MessageResponse) => void
    );
    const pAuthored = eventService.handleAuthoredPRDataActions(
      msgAuthored,
      sendResponse as (r: MessageResponse) => void
    );

    await drainMicrotasks();

    expect(persistResolvedViewerIdentity).not.toHaveBeenCalled();
    expect(getPrUiFetchDepth(eventService)).toBe(3);
    expect(prFetchInProgress).toBe(true);
    // WHY [parallel await]: `set(true)` is awaited before `prUiFetchDepth += 1`, so overlapping handlers
    // can each pass the `depth === 0` gate—three `true` writes, same as three parallel popup messages.
    expect(
      storageSet.mock.calls.filter((c) => c[0] === STORAGE_KEY_PR_FETCH_IN_PROGRESS && c[1] === true).length
    ).toBe(3);

    resolveAssigned(empty);
    resolveMerged(empty);
    await drainMicrotasks();

    expect(persistResolvedViewerIdentity).not.toHaveBeenCalled();
    expect(getPrUiFetchDepth(eventService)).toBe(1);
    expect(prFetchInProgress).toBe(true);

    resolveAuthored(empty);
    await drainMicrotasks(24);
    expect(persistResolvedViewerIdentity).toHaveBeenCalledTimes(1);
    await drainMicrotasks();

    expect(getPrUiFetchDepth(eventService)).toBe(0);
    expect(prFetchInProgress).toBe(false);
    expect(
      storageSet.mock.calls.filter((c) => c[0] === STORAGE_KEY_PR_FETCH_IN_PROGRESS && c[1] === false).length
    ).toBe(1);

    await Promise.all([pAssigned, pMerged, pAuthored]);

    expect(persistResolvedViewerIdentity).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledTimes(3);
    expect(fetchAssigned).toHaveBeenCalledWith(true);
    expect(updateMerged).toHaveBeenCalledWith(true);
    expect(updateAuthored).toHaveBeenCalledWith(true);
  });
});

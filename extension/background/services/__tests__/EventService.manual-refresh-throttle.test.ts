/**
 * Manual refresh throttle: {@link EventService.shouldThrottleManualRefresh} + `chrome.storage.session`.
 *
 * WHY [session mock]: Production writes `last_manual_refresh_at` only from the background; tests own
 * `get`/`set` to assert allowed vs throttled waves without a real browser.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventService } from '../EventService';
import type { ServiceContainer } from '../../core/ServiceContainer';
import type { ServiceMap } from '../../core/ServiceMap';
import type { IPRService } from '../../interfaces/IPRService';
import type { IStorageService } from '../../interfaces/IStorageService';
import type { IAlarmService } from '../../interfaces/IAlarmService';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { MessageResponse, PullRequest, RuntimeRequestMessage } from '@common/types';
import { MIN_REFRESH_INTERVAL_MS, STORAGE_KEY_LAST_MANUAL_REFRESH_AT } from '@common/constants';
import { EVENT_FETCH_PRS, PR_DATA_ACTION } from '@common/runtime-actions';
import type { Alarm } from '@common/chrome-extension-service';

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

async function drainMicrotasks(rounds = 24): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe.sequential('EventService manual refresh throttle', () => {
  let eventService: EventService;
  let sessionGet: Mock;
  let sessionSet: Mock;
  let fetchAssigned: Mock;
  let updateMerged: Mock;
  let updateAuthored: Mock;
  let getStoredAssigned: Mock;
  let getStoredMerged: Mock;
  let getStoredAuthored: Mock;
  let rescheduleFetchAlarmFromNow: Mock;

  const debugService: IDebugService = {
    initialize: vi.fn(),
    dispose: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  const empty: PullRequest[] = [];

  beforeEach(() => {
    vi.clearAllMocks();

    sessionGet = vi.fn().mockResolvedValue({});
    sessionSet = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal(
      'chrome',
      {
        storage: {
          session: {
            get: sessionGet,
            set: sessionSet,
          },
        },
      } as unknown as (typeof globalThis)['chrome']
    );

    getStoredAssigned = vi.fn().mockResolvedValue(empty);
    getStoredMerged = vi.fn().mockResolvedValue(empty);
    getStoredAuthored = vi.fn().mockResolvedValue(empty);

    fetchAssigned = vi.fn().mockResolvedValue(empty);
    updateMerged = vi.fn().mockResolvedValue(empty);
    updateAuthored = vi.fn().mockResolvedValue(empty);

    rescheduleFetchAlarmFromNow = vi.fn().mockResolvedValue(undefined);

    const prService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      fetchAndUpdateAssignedPRs: fetchAssigned,
      updateMergedPRs: updateMerged,
      updateAuthoredPRs: updateAuthored,
      getStoredAssignedPRs: getStoredAssigned,
      getStoredMergedPRs: getStoredMerged,
      getStoredAuthoredPRs: getStoredAuthored,
      persistResolvedViewerIdentity: vi.fn().mockResolvedValue(undefined),
      beginPrListHealthWave: vi.fn(),
    } as unknown as IPRService;

    const storageService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IStorageService;

    const alarmService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      rescheduleFetchAlarmFromNow,
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
          case 'gitHubStatusClient':
            return {
              initialize: vi.fn(),
              dispose: vi.fn(),
              getStatus: vi.fn().mockResolvedValue({
                prComponentStatus: 'operational',
                globalIndicator: 'none',
                fetchedAt: 0,
              }),
            } as unknown as ServiceMap[K];
          case 'alarmSeqClock':
            return {
              initialize: vi.fn(),
              dispose: vi.fn(),
              current: vi.fn().mockResolvedValue(0),
              advance: vi.fn().mockResolvedValue(1),
            } as unknown as ServiceMap[K];
          default:
            throw new Error(`Unexpected getService key in test: ${String(key)}`);
        }
      },
    };

    eventService = new EventService(debugService, fakeContainer as ServiceContainer);
  });

  it('allowed wave: three parallel fetch messages call PRService fetch and session.set once', async () => {
    const sendResponse = vi.fn();
    const msgAssigned = { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage;
    const msgMerged = { action: PR_DATA_ACTION.fetchMergedPRs } satisfies RuntimeRequestMessage;
    const msgAuthored = { action: PR_DATA_ACTION.fetchAuthoredPRs } satisfies RuntimeRequestMessage;

    void eventService.handleAssignedPRDataActions(
      msgAssigned,
      sendResponse as (r: MessageResponse) => void
    );
    void eventService.handleMergedPRDataActions(
      msgMerged,
      sendResponse as (r: MessageResponse) => void
    );
    void eventService.handleAuthoredPRDataActions(
      msgAuthored,
      sendResponse as (r: MessageResponse) => void
    );

    await drainMicrotasks();

    expect(fetchAssigned).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(updateMerged).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(updateAuthored).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(rescheduleFetchAlarmFromNow).toHaveBeenCalled();
    expect(sessionSet).toHaveBeenCalledTimes(1);
    expect(sessionSet).toHaveBeenCalledWith({
      [STORAGE_KEY_LAST_MANUAL_REFRESH_AT]: expect.any(Number),
    });
    expect(sendResponse).toHaveBeenCalledTimes(3);
    expect(getStoredAssigned).not.toHaveBeenCalled();
  });

  it('throttled wave: no PRService fetch, no alarm pushback, no session.set', async () => {
    const t0 = 10_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(t0);
    sessionGet.mockResolvedValue({
      [STORAGE_KEY_LAST_MANUAL_REFRESH_AT]: t0 - 5_000,
    });

    const sendResponse = vi.fn();
    const msgAssigned = { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage;
    const msgMerged = { action: PR_DATA_ACTION.fetchMergedPRs } satisfies RuntimeRequestMessage;
    const msgAuthored = { action: PR_DATA_ACTION.fetchAuthoredPRs } satisfies RuntimeRequestMessage;

    await eventService.handleAssignedPRDataActions(
      msgAssigned,
      sendResponse as (r: MessageResponse) => void
    );
    await eventService.handleMergedPRDataActions(
      msgMerged,
      sendResponse as (r: MessageResponse) => void
    );
    await eventService.handleAuthoredPRDataActions(
      msgAuthored,
      sendResponse as (r: MessageResponse) => void
    );

    expect(fetchAssigned).not.toHaveBeenCalled();
    expect(updateMerged).not.toHaveBeenCalled();
    expect(updateAuthored).not.toHaveBeenCalled();
    expect(rescheduleFetchAlarmFromNow).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(getStoredAssigned).toHaveBeenCalledTimes(1);
    expect(getStoredMerged).toHaveBeenCalledTimes(1);
    expect(getStoredAuthored).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledTimes(3);
  });

  it('second wave after 31s is allowed', async () => {
    const t0 = 20_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(t0);
    sessionGet.mockResolvedValueOnce({}).mockResolvedValueOnce({
      [STORAGE_KEY_LAST_MANUAL_REFRESH_AT]: t0,
    });

    const sendResponse1 = vi.fn();
    await eventService.handleAssignedPRDataActions(
      { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage,
      sendResponse1 as (r: MessageResponse) => void
    );
    await drainMicrotasks();
    expect(fetchAssigned).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + MIN_REFRESH_INTERVAL_MS + 1_000);
    sessionGet.mockResolvedValue({
      [STORAGE_KEY_LAST_MANUAL_REFRESH_AT]: t0,
    });

    const sendResponse2 = vi.fn();
    await eventService.handleAssignedPRDataActions(
      { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage,
      sendResponse2 as (r: MessageResponse) => void
    );
    await drainMicrotasks();

    expect(fetchAssigned).toHaveBeenCalledTimes(2);
  });

  it('manualRefreshWaveActive resets after wave completes', async () => {
    const sendResponse = vi.fn();
    const d = createDeferred<PullRequest[]>();
    fetchAssigned.mockReturnValue(d.promise);
    updateMerged.mockResolvedValue(empty);
    updateAuthored.mockResolvedValue(empty);

    void eventService.handleAssignedPRDataActions(
      { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage,
      sendResponse as (r: MessageResponse) => void
    );
    void eventService.handleMergedPRDataActions(
      { action: PR_DATA_ACTION.fetchMergedPRs } satisfies RuntimeRequestMessage,
      sendResponse as (r: MessageResponse) => void
    );
    void eventService.handleAuthoredPRDataActions(
      { action: PR_DATA_ACTION.fetchAuthoredPRs } satisfies RuntimeRequestMessage,
      sendResponse as (r: MessageResponse) => void
    );

    await drainMicrotasks();
    expect((eventService as unknown as { manualRefreshWaveActive: boolean }).manualRefreshWaveActive).toBe(
      true
    );

    d.resolve(empty);
    await drainMicrotasks(32);
    await Promise.resolve();

    expect((eventService as unknown as { manualRefreshWaveActive: boolean }).manualRefreshWaveActive).toBe(
      false
    );
  });

  it('alarm path does not reset manualRefreshWaveActive', async () => {
    const rateLimitService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      shouldSkipFetch: () => false,
    };

    const dManual = createDeferred<PullRequest[]>();
    fetchAssigned.mockReturnValueOnce(dManual.promise);

    const prServiceExtended = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      fetchAndUpdateAssignedPRs: fetchAssigned,
      updateMergedPRs: vi.fn().mockResolvedValue(empty),
      updateAuthoredPRs: vi.fn().mockResolvedValue(empty),
      getStoredAssignedPRs: getStoredAssigned,
      getStoredMergedPRs: getStoredMerged,
      getStoredAuthoredPRs: getStoredAuthored,
      persistResolvedViewerIdentity: vi.fn().mockResolvedValue(undefined),
      beginPrListHealthWave: vi.fn(),
    } as unknown as IPRService;

    const storageService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IStorageService;

    const alarmService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      rescheduleFetchAlarmFromNow,
    } as unknown as IAlarmService;

    const fakeContainer: Pick<ServiceContainer, 'getService'> = {
      getService<K extends keyof ServiceMap>(key: K): ServiceMap[K] {
        switch (key) {
          case 'debugService':
            return debugService as ServiceMap[K];
          case 'prService':
            return prServiceExtended as ServiceMap[K];
          case 'storageService':
            return storageService as ServiceMap[K];
          case 'alarmService':
            return alarmService as ServiceMap[K];
          case 'rateLimitService':
            return rateLimitService as unknown as ServiceMap[K];
          case 'gitHubStatusClient':
            return {
              initialize: vi.fn(),
              dispose: vi.fn(),
              getStatus: vi.fn().mockResolvedValue({
                prComponentStatus: 'operational',
                globalIndicator: 'none',
                fetchedAt: 0,
              }),
            } as unknown as ServiceMap[K];
          case 'alarmSeqClock':
            return {
              initialize: vi.fn(),
              dispose: vi.fn(),
              current: vi.fn().mockResolvedValue(0),
              advance: vi.fn().mockResolvedValue(1),
            } as unknown as ServiceMap[K];
          default:
            throw new Error(`Unexpected getService key in test: ${String(key)}`);
        }
      },
    };

    const es = new EventService(debugService, fakeContainer as ServiceContainer);

    void es.handleAssignedPRDataActions(
      { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage,
      vi.fn() as (r: MessageResponse) => void
    );
    await drainMicrotasks();
    expect((es as unknown as { manualRefreshWaveActive: boolean }).manualRefreshWaveActive).toBe(true);

    await es.handleAlarm({ name: EVENT_FETCH_PRS } as Alarm);
    await drainMicrotasks();

    expect((es as unknown as { manualRefreshWaveActive: boolean }).manualRefreshWaveActive).toBe(true);

    dManual.resolve(empty);
    await drainMicrotasks(40);

    expect((es as unknown as { manualRefreshWaveActive: boolean }).manualRefreshWaveActive).toBe(false);
  });

  it('double-check-after-await: deferred session.get lets siblings proceed without extra session.set', async () => {
    const { promise: getPromise, resolve: resolveGet } = createDeferred<Record<string, unknown>>();
    // WHY [same promise]: All three handlers must await one shared `get` — per-call `mockResolvedValueOnce`
    // would let the 2nd/3rd calls resolve immediately and race past the sibling flag.
    sessionGet.mockReturnValue(getPromise);

    const sendResponse = vi.fn();
    const msgAssigned = { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage;
    const msgMerged = { action: PR_DATA_ACTION.fetchMergedPRs } satisfies RuntimeRequestMessage;
    const msgAuthored = { action: PR_DATA_ACTION.fetchAuthoredPRs } satisfies RuntimeRequestMessage;

    void eventService.handleAssignedPRDataActions(
      msgAssigned,
      sendResponse as (r: MessageResponse) => void
    );
    void eventService.handleMergedPRDataActions(
      msgMerged,
      sendResponse as (r: MessageResponse) => void
    );
    void eventService.handleAuthoredPRDataActions(
      msgAuthored,
      sendResponse as (r: MessageResponse) => void
    );

    await drainMicrotasks();
    resolveGet({});
    await drainMicrotasks();

    expect(fetchAssigned).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(updateMerged).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(updateAuthored).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(sessionSet).toHaveBeenCalledTimes(1);
  });
});

/**
 * Verifies the alarm wave's Statuspage prefetch contract.
 *
 * WHY [single network call per wave]: `EventService.handleAlarm` runs assigned → merged → authored
 * sequentially. Each assess() call would otherwise hit `getStatus` once. The prefetch shares one
 * fresh snapshot across all three so we burn one `summary.json` request, not three. This test
 * pins the contract.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventService } from '../EventService';
import type { ServiceContainer } from '../../core/ServiceContainer';
import type { ServiceMap } from '../../core/ServiceMap';
import type { IPRService } from '../../interfaces/IPRService';
import type { IStorageService } from '../../interfaces/IStorageService';
import type { IAlarmService } from '../../interfaces/IAlarmService';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { IRateLimitService } from '../../interfaces/IRateLimitService';
import type { IGitHubStatusClient, GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { Alarm } from '@common/chrome-extension-service';
import { EVENT_FETCH_PRS } from '@common/runtime-actions';

describe('EventService alarm wave Statuspage prefetch', () => {
  let getStatus: Mock<IGitHubStatusClient['getStatus']>;
  let advance: Mock<() => Promise<number>>;
  let fetchAssigned: Mock;
  let updateMerged: Mock;
  let updateAuthored: Mock;
  let eventService: EventService;

  const debugService: IDebugService = {
    initialize: vi.fn(),
    dispose: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as (typeof globalThis)['chrome']);

    const fixedSnapshot: GitHubStatusSnapshot = {
      prComponentStatus: 'operational',
      globalIndicator: 'none',
      fetchedAt: 0,
    };

    getStatus = vi.fn().mockResolvedValue(fixedSnapshot);
    advance = vi.fn().mockResolvedValue(1);
    fetchAssigned = vi.fn().mockResolvedValue([]);
    updateMerged = vi.fn().mockResolvedValue([]);
    updateAuthored = vi.fn().mockResolvedValue([]);

    const prService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      beginPrListHealthWave: vi.fn(),
      fetchAndUpdateAssignedPRs: fetchAssigned,
      updateMergedPRs: updateMerged,
      updateAuthoredPRs: updateAuthored,
      persistResolvedViewerIdentity: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPRService;

    const storageService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IStorageService;

    const alarmService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      rescheduleFetchAlarmFromNow: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAlarmService;

    const rateLimitService = {
      shouldSkipFetch: vi.fn().mockReturnValue(false),
    } as unknown as IRateLimitService;

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
          case 'rateLimitService':
            return rateLimitService as ServiceMap[K];
          case 'gitHubStatusClient':
            return { initialize: vi.fn(), dispose: vi.fn(), getStatus } as unknown as ServiceMap[K];
          case 'alarmSeqClock':
            return {
              initialize: vi.fn(),
              dispose: vi.fn(),
              current: vi.fn().mockResolvedValue(0),
              advance,
            } as unknown as ServiceMap[K];
          default:
            throw new Error(`Unexpected getService key in test: ${String(key)}`);
        }
      },
    };

    eventService = new EventService(debugService, fakeContainer as ServiceContainer);
  });

  it('handleAlarm prefetches Statuspage exactly once with bypassCache, then advances alarm seq', async () => {
    await eventService.handleAlarm({ name: EVENT_FETCH_PRS } as Alarm);

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledWith({ bypassCache: true });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('threads the prefetched snapshot to all three list updates', async () => {
    await eventService.handleAlarm({ name: EVENT_FETCH_PRS } as Alarm);

    const expectedSnapshot = expect.objectContaining({ prComponentStatus: 'operational' });
    expect(fetchAssigned).toHaveBeenCalledWith(false, true, expectedSnapshot);
    expect(updateMerged).toHaveBeenCalledWith(false, true, expectedSnapshot);
    expect(updateAuthored).toHaveBeenCalledWith(false, true, expectedSnapshot);
  });
});

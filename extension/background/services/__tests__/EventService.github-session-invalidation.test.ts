import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventService } from '../EventService';
import type { ServiceContainer } from '../../core/ServiceContainer';
import type { ServiceMap } from '../../core/ServiceMap';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { IPRService } from '../../interfaces/IPRService';
import type { IStorageService } from '../../interfaces/IStorageService';
import type { IAlarmService } from '../../interfaces/IAlarmService';
import type { IBadgeService } from '../../interfaces/IBadgeService';
import type { IHealthStatusService } from '../../interfaces/IHealthStatusService';
import type { IRateLimitService } from '../../interfaces/IRateLimitService';
import type { MessageResponse, RuntimeRequestMessage } from '@common/types';
import { GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE } from '@common/errors';
import { EVENT_FETCH_PRS, PR_DATA_ACTION } from '@common/runtime-actions';
import type { Alarm } from '@common/chrome-extension-service';

const debugService: IDebugService = {
  initialize: vi.fn(),
  dispose: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

describe('EventService GitHub web-session invalidation', () => {
  let clearGitHubWebSessionCaches: Mock;
  let setDefaultBadge: Mock;
  let clearGitHubOutage: Mock;
  let clearParserBreakage: Mock;
  let eventService: EventService;

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
    clearGitHubWebSessionCaches = vi.fn().mockResolvedValue(undefined);
    setDefaultBadge = vi.fn().mockResolvedValue(undefined);
    clearGitHubOutage = vi.fn().mockResolvedValue(undefined);
    clearParserBreakage = vi.fn().mockResolvedValue(undefined);

    const storageService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
      clearGitHubWebSessionCaches,
    } as unknown as IStorageService;

    const badgeService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      setDefaultBadge,
    } as unknown as IBadgeService;

    const healthStatusService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      clearGitHubOutage,
      clearParserBreakage,
      signalGitHubOutage: vi.fn().mockResolvedValue(undefined),
      signalParserBreakage: vi.fn().mockResolvedValue(undefined),
    } as unknown as IHealthStatusService;

    const prService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      fetchAndUpdateAssignedPRs: vi
        .fn()
        .mockRejectedValue(new Error('NotLoggedIn: User is not logged in to GitHub.')),
      updateMergedPRs: vi.fn(),
      updateAuthoredPRs: vi.fn(),
      persistResolvedViewerIdentity: vi.fn().mockResolvedValue(undefined),
      beginPrListHealthWave: vi.fn(),
    } as unknown as IPRService;

    const alarmService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      rescheduleFetchAlarmFromNow: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAlarmService;

    const rateLimitService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      shouldSkipFetch: () => false,
    } as unknown as IRateLimitService;

    const fakeContainer: Pick<ServiceContainer, 'getService'> = {
      getService<K extends keyof ServiceMap>(key: K): ServiceMap[K] {
        switch (key) {
          case 'debugService':
            return debugService as ServiceMap[K];
          case 'storageService':
            return storageService as ServiceMap[K];
          case 'badgeService':
            return badgeService as ServiceMap[K];
          case 'prService':
            return prService as ServiceMap[K];
          case 'alarmService':
            return alarmService as ServiceMap[K];
          case 'rateLimitService':
            return rateLimitService as ServiceMap[K];
          case 'healthStatusService':
            return healthStatusService as ServiceMap[K];
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

  it('handleAlarm clears GitHub-derived storage when the fetch proves logged out', async () => {
    await eventService.handleAlarm({ name: EVENT_FETCH_PRS } as Alarm);
    expect(clearGitHubWebSessionCaches).toHaveBeenCalledTimes(1);
    expect(clearGitHubOutage).toHaveBeenCalledTimes(1);
    expect(clearParserBreakage).toHaveBeenCalledTimes(1);
    expect(setDefaultBadge).toHaveBeenCalledTimes(1);
  });

  it('handleAssignedPRDataActions clears storage on fetchAssignedPRs auth failure', async () => {
    const sendResponse = vi.fn();
    await eventService.handleAssignedPRDataActions(
      { action: PR_DATA_ACTION.fetchAssignedPRs } satisfies RuntimeRequestMessage,
      sendResponse as (r: MessageResponse) => void
    );
    expect(clearGitHubWebSessionCaches).toHaveBeenCalledTimes(1);
    expect(clearGitHubOutage).toHaveBeenCalledTimes(1);
    expect(clearParserBreakage).toHaveBeenCalledTimes(1);
    expect(setDefaultBadge).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE })
    );
  });

  it('resets health-flag in-memory mirrors after storage wipe so dedupe does not stick', async () => {
    await eventService.handleAlarm({ name: EVENT_FETCH_PRS } as Alarm);

    const wipeOrder = clearGitHubWebSessionCaches.mock.invocationCallOrder[0];
    const outageOrder = clearGitHubOutage.mock.invocationCallOrder[0];
    const parserOrder = clearParserBreakage.mock.invocationCallOrder[0];

    expect(wipeOrder).toBeLessThan(outageOrder);
    expect(wipeOrder).toBeLessThan(parserOrder);
  });
});

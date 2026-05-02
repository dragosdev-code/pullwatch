import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ServiceContainer } from '../../../core/ServiceContainer';
import type { MessageResponse } from '@common/types';
import { STORAGE_KEY_LAST_MANUAL_REFRESH_AT } from '@common/constants';
import { ManualPrRefreshCoordinator } from '../ManualPrRefreshCoordinator';
import type { IPRService } from '../../../interfaces/IPRService';
import type { IAlarmService } from '../../../interfaces/IAlarmService';

const storageSessionGet = vi.fn();
const storageSessionSet = vi.fn().mockResolvedValue(undefined);

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      session: {
        get: (...args: unknown[]) => storageSessionGet(...args),
        set: (...args: unknown[]) => storageSessionSet(...args),
      },
    },
  },
}));

function createSendResponse() {
  return vi.fn<(response: MessageResponse) => void>();
}

function createHarness(prOverrides: Partial<IPRService> = {}) {
  const fetchAssigned = vi.fn().mockResolvedValue([]);
  const updateMerged = vi.fn().mockResolvedValue([]);
  const updateAuthored = vi.fn().mockResolvedValue([]);

  const prService = {
    beginPrListHealthWave: vi.fn(),
    fetchAndUpdateAssignedPRs: fetchAssigned,
    updateMergedPRs: updateMerged,
    updateAuthoredPRs: updateAuthored,
    getStoredAssignedPRs: vi.fn().mockResolvedValue([]),
    getStoredMergedPRs: vi.fn().mockResolvedValue([]),
    getStoredAuthoredPRs: vi.fn().mockResolvedValue([]),
    ...prOverrides,
  } as unknown as IPRService;

  const rescheduleFetchAlarmFromNow = vi.fn().mockResolvedValue(undefined);
  const alarmService = {
    rescheduleFetchAlarmFromNow,
  } as unknown as IAlarmService;

  const gitHubStatusClient = {
    getStatus: vi.fn().mockResolvedValue({
      prComponentStatus: 'operational',
      globalIndicator: 'none',
      fetchedAt: 0,
    }),
  };

  const container = {
    getService: vi.fn((key: string) => {
      if (key === 'prService') return prService;
      if (key === 'alarmService') return alarmService;
      if (key === 'gitHubStatusClient') return gitHubStatusClient;
      throw new Error(`Unexpected service: ${key}`);
    }),
  } as unknown as ServiceContainer;

  const debugService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const withPrUiFetchIndicator = async <T>(fn: () => Promise<T>) => fn();

  const invalidateGitHubWebSessionAfterAuthFailure = vi.fn().mockResolvedValue(undefined);
  const logCatchAsWarningIfAuth = vi.fn();

  const coordinator = new ManualPrRefreshCoordinator({
    debugService: debugService as never,
    serviceContainer: container,
    withPrUiFetchIndicator,
    invalidateGitHubWebSessionAfterAuthFailure,
    logCatchAsWarningIfAuth,
  });

  return {
    coordinator,
    prService,
    rescheduleFetchAlarmFromNow,
    invalidateGitHubWebSessionAfterAuthFailure,
    fetchAssigned,
    updateMerged,
    updateAuthored,
    gitHubStatusClient,
  };
}

describe('User requested refresh from the popup', () => {
  beforeEach(() => {
    storageSessionGet.mockReset();
    storageSessionSet.mockReset().mockResolvedValue(undefined);
    storageSessionGet.mockResolvedValue({
      [STORAGE_KEY_LAST_MANUAL_REFRESH_AT]: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('coordinates a full refresh without duplicating work when multiple lists are stale', async () => {
    const {
      coordinator,
      rescheduleFetchAlarmFromNow,
      fetchAssigned,
      updateMerged,
      updateAuthored,
      gitHubStatusClient,
    } = createHarness();

    const sendAssigned = createSendResponse();
    const sendMerged = createSendResponse();
    const sendAuthored = createSendResponse();

    await Promise.all([
      coordinator.run('assigned', sendAssigned),
      coordinator.run('merged', sendMerged),
      coordinator.run('authored', sendAuthored),
    ]);

    expect(fetchAssigned).toHaveBeenCalledTimes(1);
    expect(fetchAssigned).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(updateMerged).toHaveBeenCalledTimes(1);
    expect(updateMerged).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));
    expect(updateAuthored).toHaveBeenCalledTimes(1);
    expect(updateAuthored).toHaveBeenCalledWith(true, false, expect.objectContaining({
      prComponentStatus: 'operational',
    }));

    expect(rescheduleFetchAlarmFromNow).toHaveBeenCalledTimes(1);
    // Coalesced wave Statuspage prefetch: three parallel handlers → one summary.json fetch.
    expect(gitHubStatusClient.getStatus).toHaveBeenCalledTimes(1);
    expect(gitHubStatusClient.getStatus).toHaveBeenCalledWith({ bypassCache: true });

    expect(sendAssigned).toHaveBeenCalledWith({ success: true, data: [] });
    expect(sendMerged).toHaveBeenCalledWith({ success: true, data: [] });
    expect(sendAuthored).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('gracefully completes the coordination even if one of the list fetches fails', async () => {
    const updateMerged = vi.fn().mockRejectedValue(new Error('merged list failed'));

    const { coordinator, fetchAssigned, updateAuthored, invalidateGitHubWebSessionAfterAuthFailure } =
      createHarness({
        updateMergedPRs: updateMerged,
      } as Partial<IPRService>);

    const sendAssigned = createSendResponse();
    const sendMerged = createSendResponse();
    const sendAuthored = createSendResponse();

    const results = await Promise.allSettled([
      coordinator.run('assigned', sendAssigned),
      coordinator.run('merged', sendMerged),
      coordinator.run('authored', sendAuthored),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    expect(fetchAssigned).toHaveBeenCalledTimes(1);
    expect(updateMerged).toHaveBeenCalledTimes(1);
    expect(updateAuthored).toHaveBeenCalledTimes(1);

    expect(sendAssigned).toHaveBeenCalledWith({ success: true, data: [] });
    expect(sendAuthored).toHaveBeenCalledWith({ success: true, data: [] });
    expect(sendMerged).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to handle merged PR action',
    });

    expect(invalidateGitHubWebSessionAfterAuthFailure).not.toHaveBeenCalled();
  });
});

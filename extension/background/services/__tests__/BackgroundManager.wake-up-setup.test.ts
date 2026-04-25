import { describe, it, expect, vi } from 'vitest';
import type { ServiceContainer } from '../../core/ServiceContainer';
import type { ServiceMap } from '../../core/ServiceMap';
import { BackgroundManager } from '../BackgroundManager';

type Harness = {
  container: {
    initialize: ReturnType<typeof vi.fn>;
    getService: ReturnType<typeof vi.fn>;
  };
  debugService: {
    initialize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  permissionService: {
    initialize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    checkAllPermissions: ReturnType<typeof vi.fn>;
  };
  alarmService: {
    initialize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    setupFetchAlarm: ReturnType<typeof vi.fn>;
  };
  prService: {
    initialize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    syncBadgeFromStorage: ReturnType<typeof vi.fn>;
    fetchAndUpdateAssignedPRs: ReturnType<typeof vi.fn>;
    updateAuthoredPRs: ReturnType<typeof vi.fn>;
    updateMergedPRs: ReturnType<typeof vi.fn>;
  };
};

function createHarness(): Harness {
  const debugService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  const permissionService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    checkAllPermissions: vi.fn().mockResolvedValue(true),
  };

  const alarmService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    setupFetchAlarm: vi.fn().mockResolvedValue(undefined),
  };

  const prService = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    syncBadgeFromStorage: vi.fn().mockResolvedValue(undefined),
    fetchAndUpdateAssignedPRs: vi.fn(),
    updateAuthoredPRs: vi.fn(),
    updateMergedPRs: vi.fn(),
  };

  const container = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getService: vi.fn(<K extends keyof ServiceMap>(key: K): ServiceMap[K] => {
      switch (key) {
        case 'debugService':
          return debugService as unknown as ServiceMap[K];
        case 'permissionService':
          return permissionService as unknown as ServiceMap[K];
        case 'alarmService':
          return alarmService as unknown as ServiceMap[K];
        case 'prService':
          return prService as unknown as ServiceMap[K];
        default:
          throw new Error(`Unexpected service key: ${String(key)}`);
      }
    }),
  };

  return { container, debugService, permissionService, alarmService, prService };
}

describe('Background wake-up setup', () => {
  it('restores permissions, schedules fetches, and syncs the toolbar badge from saved data without fetching GitHub', async () => {
    const { container, debugService, permissionService, alarmService, prService } = createHarness();
    const manager = new BackgroundManager(container as unknown as ServiceContainer);

    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(container.initialize).toHaveBeenCalledTimes(1);
    expect(permissionService.checkAllPermissions).toHaveBeenCalledTimes(1);
    expect(alarmService.setupFetchAlarm).toHaveBeenCalledTimes(1);
    expect(prService.syncBadgeFromStorage).toHaveBeenCalledTimes(1);

    expect(prService.fetchAndUpdateAssignedPRs).not.toHaveBeenCalled();
    expect(prService.updateAuthoredPRs).not.toHaveBeenCalled();
    expect(prService.updateMergedPRs).not.toHaveBeenCalled();

    expect(debugService.log).toHaveBeenCalledWith(
      '[BackgroundManager] Initial setup completed',
    );
    expect(debugService.log).toHaveBeenCalledWith(
      '[BackgroundManager] Successfully initialized',
    );
  });

  it('still completes setup when permission or alarm steps throw', async () => {
    // WHY [single try in performInitialSetup]: permission → alarm → badge run sequentially;
    // a throw skips the rest of the block but does not reject initialize() (inner catch only).
    {
      const { container, permissionService, alarmService, prService, debugService } =
        createHarness();
      permissionService.checkAllPermissions.mockRejectedValueOnce(new Error('permission denied'));

      const manager = new BackgroundManager(container as unknown as ServiceContainer);
      await expect(manager.initialize()).resolves.toBeUndefined();

      expect(permissionService.checkAllPermissions).toHaveBeenCalledTimes(1);
      expect(alarmService.setupFetchAlarm).not.toHaveBeenCalled();
      expect(prService.syncBadgeFromStorage).not.toHaveBeenCalled();
      expect(debugService.error).toHaveBeenCalled();
    }

    {
      const { container, permissionService, alarmService, prService, debugService } =
        createHarness();
      alarmService.setupFetchAlarm.mockRejectedValueOnce(new Error('alarm failed'));

      const manager = new BackgroundManager(container as unknown as ServiceContainer);
      await expect(manager.initialize()).resolves.toBeUndefined();

      expect(permissionService.checkAllPermissions).toHaveBeenCalledTimes(1);
      expect(alarmService.setupFetchAlarm).toHaveBeenCalledTimes(1);
      expect(prService.syncBadgeFromStorage).not.toHaveBeenCalled();
      expect(debugService.error).toHaveBeenCalled();
    }
  });
});

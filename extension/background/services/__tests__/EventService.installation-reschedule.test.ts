/**
 * Pins the "lifecycle hydration must push the fetch alarm forward" contract.
 *
 * WHY [reload double-fetch class]: `AlarmService.setupFetchAlarm` early-returns when an existing
 * alarm's cadence already matches, deliberately preserving Chrome's `scheduledTime` across wakes.
 * That makes a duplicate wave possible on `onInstalled` (developer reload + extension update) and
 * `onStartup` (browser profile restart) if the preserved alarm is due within the interval. The
 * install/startup hydration paths now call `rescheduleFetchAlarmFromNow` before the wave to push
 * the next alarm fire to `now + interval`; these tests pin that call and its ordering.
 *
 * WHY [`else` covers every non-install reason]: developer reload, store updates, `chrome_update`,
 * and `shared_module_update` all enter the same branch. A future refactor that splits out
 * `reason === 'update'` and forgets the other reasons would silently regress the fix — case 4
 * exists to catch that.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventService } from '../EventService';
import type { ServiceContainer } from '../../core/ServiceContainer';
import type { ServiceMap } from '../../core/ServiceMap';
import type { IPRService } from '../../interfaces/IPRService';
import type { IStorageService } from '../../interfaces/IStorageService';
import type { IAlarmService } from '../../interfaces/IAlarmService';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { IPermissionService } from '../../interfaces/IPermissionService';
import type { IBadgeService } from '../../interfaces/IBadgeService';
import type { InstalledDetails } from '@common/chrome-extension-service';

describe('EventService lifecycle hydration reschedules fetch alarm', () => {
  let setupFetchAlarm: Mock;
  let rescheduleFetchAlarmFromNow: Mock;
  let fetchAssigned: Mock;
  let updateMerged: Mock;
  let updateAuthored: Mock;
  let beginWave: Mock;
  let persistViewerIdentity: Mock;
  let storageSet: Mock;
  let storageRemove: Mock;
  let setLoadingBadge: Mock;
  let checkAllPermissions: Mock;
  let debugWarn: Mock;
  let eventService: EventService;

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as (typeof globalThis)['chrome']);

    setupFetchAlarm = vi.fn().mockResolvedValue(undefined);
    rescheduleFetchAlarmFromNow = vi.fn().mockResolvedValue(undefined);
    fetchAssigned = vi.fn().mockResolvedValue([]);
    updateMerged = vi.fn().mockResolvedValue([]);
    updateAuthored = vi.fn().mockResolvedValue([]);
    beginWave = vi.fn();
    persistViewerIdentity = vi.fn().mockResolvedValue(undefined);
    storageSet = vi.fn().mockResolvedValue(undefined);
    storageRemove = vi.fn().mockResolvedValue(undefined);
    setLoadingBadge = vi.fn().mockResolvedValue(undefined);
    checkAllPermissions = vi.fn().mockResolvedValue(undefined);
    debugWarn = vi.fn();

    const debugService: IDebugService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: debugWarn,
    };

    const prService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      beginPrListHealthWave: beginWave,
      fetchAndUpdateAssignedPRs: fetchAssigned,
      updateMergedPRs: updateMerged,
      updateAuthoredPRs: updateAuthored,
      persistResolvedViewerIdentity: persistViewerIdentity,
    } as unknown as IPRService;

    const storageService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      set: storageSet,
      remove: storageRemove,
    } as unknown as IStorageService;

    const alarmService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      setupFetchAlarm,
      rescheduleFetchAlarmFromNow,
    } as unknown as IAlarmService;

    const permissionService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      checkAllPermissions,
    } as unknown as IPermissionService;

    const badgeService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      setLoadingBadge,
    } as unknown as IBadgeService;

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
          case 'permissionService':
            return permissionService as ServiceMap[K];
          case 'badgeService':
            return badgeService as ServiceMap[K];
          default:
            throw new Error(`Unexpected getService key in test: ${String(key)}`);
        }
      },
    };

    eventService = new EventService(debugService, fakeContainer as ServiceContainer);
  });

  it("handleInstallation({reason:'update'}) reschedules exactly once, before the wave", async () => {
    await eventService.handleInstallation({ reason: 'update' } as InstalledDetails);

    expect(rescheduleFetchAlarmFromNow).toHaveBeenCalledTimes(1);

    const rescheduleOrder = rescheduleFetchAlarmFromNow.mock.invocationCallOrder[0];
    const firstFetchOrder = fetchAssigned.mock.invocationCallOrder[0];
    expect(rescheduleOrder).toBeLessThan(firstFetchOrder);
  });

  it("handleInstallation({reason:'update'}) still calls setupFetchAlarm (cadence drift handling preserved)", async () => {
    await eventService.handleInstallation({ reason: 'update' } as InstalledDetails);

    expect(setupFetchAlarm).toHaveBeenCalledTimes(1);
    // WHY [order]: setupFetchAlarm runs first so cadence reconciliation always lands, then we
    // push the alarm forward to avoid the leftover-scheduledTime double wave.
    const setupOrder = setupFetchAlarm.mock.invocationCallOrder[0];
    const rescheduleOrder = rescheduleFetchAlarmFromNow.mock.invocationCallOrder[0];
    expect(setupOrder).toBeLessThan(rescheduleOrder);
  });

  it("handleInstallation({reason:'install'}) does NOT reschedule (cold install creates fresh alarm)", async () => {
    await eventService.handleInstallation({ reason: 'install' } as InstalledDetails);

    expect(setupFetchAlarm).toHaveBeenCalledTimes(1);
    expect(rescheduleFetchAlarmFromNow).not.toHaveBeenCalled();
    // Install branch still hydrates with forceRefresh=true; confirm we didn't accidentally skip it.
    expect(fetchAssigned).toHaveBeenCalledWith(true, true);
  });

  it("handleInstallation({reason:'chrome_update'}) reschedules — every non-install reason runs the push-back", async () => {
    // WHY [guard rail]: a future refactor that special-cases `update` only must not silently
    // drop chrome_update / shared_module_update from the reschedule contract.
    await eventService.handleInstallation({ reason: 'chrome_update' } as InstalledDetails);

    expect(rescheduleFetchAlarmFromNow).toHaveBeenCalledTimes(1);
    expect(fetchAssigned).toHaveBeenCalledWith(false, true);
  });

  it('handleStartup() reschedules before the wave (browser-restart symmetry with onInstalled)', async () => {
    await eventService.handleStartup();

    expect(rescheduleFetchAlarmFromNow).toHaveBeenCalledTimes(1);

    const rescheduleOrder = rescheduleFetchAlarmFromNow.mock.invocationCallOrder[0];
    const firstFetchOrder = fetchAssigned.mock.invocationCallOrder[0];
    expect(rescheduleOrder).toBeLessThan(firstFetchOrder);
  });

  it("handleInstallation({reason:'update'}) when reschedule rejects: outer catch swallows and the wave is skipped", async () => {
    // WHY [error contract]: rescheduleFetchAlarmFromNow rejection propagates to the outer
    // try/catch in handleInstallation. The wave is skipped (acceptable — next alarm tick will
    // retry hydration). Pinning this avoids a future inner try/catch that would silently
    // re-introduce the leftover-alarm race if the reschedule fails.
    rescheduleFetchAlarmFromNow.mockRejectedValueOnce(new Error('alarms api unavailable'));

    await eventService.handleInstallation({ reason: 'update' } as InstalledDetails);

    expect(fetchAssigned).not.toHaveBeenCalled();
    expect(updateMerged).not.toHaveBeenCalled();
    expect(updateAuthored).not.toHaveBeenCalled();
  });
});

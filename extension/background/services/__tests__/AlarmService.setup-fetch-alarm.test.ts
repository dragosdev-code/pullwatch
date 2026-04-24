/**
 * {@link AlarmService.setupFetchAlarm} — cadence reconciliation vs persisted override state.
 *
 * WHY [chrome.alarms mocks]: Asserts recreate only when `periodInMinutes` disagrees with
 * `getEffectiveFetchIntervalMs`, without a browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AlarmService } from '../AlarmService';
import type { IDebugService } from '../../interfaces/IDebugService';
import { FETCH_INTERVAL_MS, STORAGE_KEY_ALARM_OVERRIDE } from '../../../common/constants';
import { EVENT_FETCH_PRS } from '../../../common/runtime-actions';
import type { Alarm, AlarmCreateInfo } from '@common/chrome-extension-service';

describe.sequential('AlarmService.setupFetchAlarm', () => {
  let alarmByName: Record<string, Alarm | undefined>;
  let alarmsCreate: Mock;
  let alarmsClear: Mock;
  let alarmsGetAll: Mock;
  let storageLocalGet: Mock;

  const debugService: IDebugService = {
    initialize: vi.fn(),
    dispose: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    alarmByName = {};

    alarmsCreate = vi.fn(async (name: string, info: AlarmCreateInfo) => {
      alarmByName[name] = {
        name,
        scheduledTime: Date.now(),
        periodInMinutes: info.periodInMinutes,
      };
    });

    alarmsClear = vi.fn(async (name: string) => {
      const existed = name in alarmByName;
      delete alarmByName[name];
      return existed;
    });

    alarmsGetAll = vi.fn(async () =>
      Object.values(alarmByName).filter(Boolean) as Alarm[]
    );

    storageLocalGet = vi.fn().mockResolvedValue({});

    vi.stubGlobal(
      'chrome',
      {
        storage: {
          local: {
            get: storageLocalGet,
          },
        },
        alarms: {
          create: alarmsCreate,
          get: async (name: string) => alarmByName[name],
          getAll: alarmsGetAll,
          clear: alarmsClear,
        },
        runtime: { lastError: undefined },
      } as unknown as (typeof globalThis)['chrome']
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates the fetch alarm when none exists (production interval)', async () => {
    const svc = new AlarmService(debugService);
    await svc.setupFetchAlarm();

    expect(alarmsCreate).toHaveBeenCalledTimes(1);
    expect(alarmsCreate).toHaveBeenCalledWith(EVENT_FETCH_PRS, {
      periodInMinutes: FETCH_INTERVAL_MS / (60 * 1000),
    });
  });

  it('does not recreate when an alarm already matches the effective interval', async () => {
    const periodInMinutes = FETCH_INTERVAL_MS / (60 * 1000);
    alarmByName[EVENT_FETCH_PRS] = {
      name: EVENT_FETCH_PRS,
      scheduledTime: Date.now(),
      periodInMinutes,
    };

    const svc = new AlarmService(debugService);
    await svc.setupFetchAlarm();

    expect(alarmsCreate).not.toHaveBeenCalled();
    expect(alarmsClear).not.toHaveBeenCalled();
  });

  it('clears and recreates when periodInMinutes disagrees with effective interval', async () => {
    alarmByName[EVENT_FETCH_PRS] = {
      name: EVENT_FETCH_PRS,
      scheduledTime: Date.now(),
      periodInMinutes: 999,
    };

    const svc = new AlarmService(debugService);
    await svc.setupFetchAlarm();

    expect(alarmsClear).toHaveBeenCalledWith(EVENT_FETCH_PRS);
    expect(alarmsCreate).toHaveBeenCalledTimes(1);
    expect(alarmsCreate).toHaveBeenCalledWith(EVENT_FETCH_PRS, {
      periodInMinutes: FETCH_INTERVAL_MS / (60 * 1000),
    });
  });

  it('recreates when the alarm has no repeat period (one-shot shape)', async () => {
    alarmByName[EVENT_FETCH_PRS] = {
      name: EVENT_FETCH_PRS,
      scheduledTime: Date.now(),
    };

    const svc = new AlarmService(debugService);
    await svc.setupFetchAlarm();

    expect(alarmsClear).toHaveBeenCalled();
    expect(alarmsCreate).toHaveBeenCalled();
  });

  it('matches a dev override interval persisted in storage', async () => {
    const overrideMs = 120_000;
    storageLocalGet.mockResolvedValue({
      [STORAGE_KEY_ALARM_OVERRIDE]: { overridden: true, intervalMs: overrideMs },
    });

    const svc = new AlarmService(debugService);
    await svc.setupFetchAlarm();

    expect(alarmsCreate).toHaveBeenCalledWith(EVENT_FETCH_PRS, {
      periodInMinutes: overrideMs / (60 * 1000),
    });
  });

  it('getAlarmStatus reports currentIntervalMs from resolveEffectiveFetchIntervalMs', async () => {
    storageLocalGet.mockResolvedValue({
      [STORAGE_KEY_ALARM_OVERRIDE]: { overridden: true, intervalMs: 60_000 },
    });

    alarmByName[EVENT_FETCH_PRS] = {
      name: EVENT_FETCH_PRS,
      scheduledTime: Date.now(),
      periodInMinutes: 1,
    };

    const svc = new AlarmService(debugService);
    const status = await svc.getAlarmStatus();

    expect(status.currentIntervalMs).toBe(60_000);
    expect(status.isOverridden).toBe(true);
  });
});

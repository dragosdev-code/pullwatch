import type { IAlarmService } from '../interfaces/IAlarmService';
import type { IDebugService } from '../interfaces/IDebugService';
import { FETCH_INTERVAL_MS, DEV_TEST_MIN_ALARM_OVERRIDE_MS, STORAGE_KEY_ALARM_OVERRIDE } from '../../common/constants';
import { EVENT_FETCH_PRS } from '../../common/runtime-actions';

interface AlarmOverrideState {
  overridden: boolean;
  intervalMs: number | null;
}

/**
 * AlarmService handles Chrome extension alarm scheduling and management.
 * Manages periodic tasks like PR fetching through Chrome's alarm API.
 * Override state is persisted to chrome.storage.local so it survives service worker restarts.
 */
export class AlarmService implements IAlarmService {
  private debugService: IDebugService;
  private initialized = false;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  /**
   * Initializes the alarm service and restores persisted override state.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[AlarmService] Alarm service initialized');
  }

  private async getOverrideState(): Promise<AlarmOverrideState> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_ALARM_OVERRIDE);
      return result[STORAGE_KEY_ALARM_OVERRIDE] || { overridden: false, intervalMs: null };
    } catch {
      return { overridden: false, intervalMs: null };
    }
  }

  private async setOverrideState(state: AlarmOverrideState): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_ALARM_OVERRIDE]: state });
  }

  private intervalMsToAlarmMinutes(intervalMs: number): number {
    return intervalMs / (60 * 1000);
  }

  private clampDevOverrideIntervalMs(requestedMs: number): number {
    return Math.max(requestedMs, DEV_TEST_MIN_ALARM_OVERRIDE_MS);
  }

  /**
   * Effective PR-fetch cadence from persisted override state (single source of truth).
   */
  private resolveEffectiveFetchIntervalMs(state: AlarmOverrideState): number {
    if (state.overridden && state.intervalMs != null) {
      return state.intervalMs;
    }
    return FETCH_INTERVAL_MS;
  }

  private async getEffectiveFetchIntervalMs(): Promise<number> {
    return this.resolveEffectiveFetchIntervalMs(await this.getOverrideState());
  }

  /**
   * Compares the live Chrome alarm's repeat cadence to the interval implied by
   * {@link resolveEffectiveFetchIntervalMs} (production constant or dev override in storage).
   *
   * WHY [not only `getAlarm` truthiness]: `setupFetchAlarm` runs on every wake; override state can
   * change while the worker slept (e.g. persisted `STORAGE_KEY_ALARM_OVERRIDE`). Returning early
   * whenever *an* alarm exists would leave PR fetches on a stale `periodInMinutes` until something
   * else recreates the alarm.
   */
  private alarmRepeatCadenceMatchesInterval(
    alarm: chrome.alarms.Alarm,
    effectiveIntervalMs: number
  ): boolean {
    if (alarm.periodInMinutes == null || alarm.periodInMinutes <= 0) {
      return false;
    }
    const alarmIntervalMs = alarm.periodInMinutes * 60 * 1000;
    return Math.abs(alarmIntervalMs - effectiveIntervalMs) < 1;
  }

  /**
   * Sets up the fetch alarm for periodic PR fetching.
   */
  async setupFetchAlarm(): Promise<void> {
    try {
      this.debugService.log('[AlarmService] Setting up fetch alarm...');

      const intervalMs = await this.getEffectiveFetchIntervalMs();
      const periodInMinutes = this.intervalMsToAlarmMinutes(intervalMs);

      const existingAlarm = await this.getAlarm(EVENT_FETCH_PRS);

      if (existingAlarm && this.alarmRepeatCadenceMatchesInterval(existingAlarm, intervalMs)) {
        this.debugService.log('[AlarmService] Fetch alarm already matches effective cadence:', existingAlarm);
        return;
      }

      if (existingAlarm) {
        this.debugService.log(
          '[AlarmService] Fetch alarm cadence out of sync with effective interval; recreating',
          { periodInMinutes: existingAlarm.periodInMinutes, effectiveIntervalMs: intervalMs }
        );
        await this.clearAlarm(EVENT_FETCH_PRS);
      }

      await this.createAlarm(EVENT_FETCH_PRS, {
        periodInMinutes,
      });

      this.debugService.log(
        `[AlarmService] Fetch alarm ${existingAlarm ? 're' : ''}created with period: ${periodInMinutes} minutes`
      );
    } catch (error) {
      this.debugService.error('[AlarmService] Error setting up fetch alarm:', error);
      throw error;
    }
  }

  /**
   * Creates a new alarm with the given name and configuration.
   */
  async createAlarm(name: string, alarmInfo: chrome.alarms.AlarmCreateInfo): Promise<void> {
    try {
      await chrome.alarms.create(name, alarmInfo);
      this.debugService.log(`[AlarmService] Alarm '${name}' created:`, alarmInfo);
    } catch (error) {
      this.debugService.error(`[AlarmService] Error creating alarm '${name}':`, error);
      throw error;
    }
  }

  /**
   * Gets an existing alarm by name.
   */
  async getAlarm(name: string): Promise<chrome.alarms.Alarm | undefined> {
    try {
      return new Promise((resolve) => {
        chrome.alarms.get(name, (alarm) => {
          if (chrome.runtime.lastError) {
            this.debugService.error(
              `[AlarmService] Error getting alarm '${name}':`,
              chrome.runtime.lastError
            );
            resolve(undefined);
            return;
          }
          resolve(alarm);
        });
      });
    } catch (error) {
      this.debugService.error(`[AlarmService] Error getting alarm '${name}':`, error);
      return undefined;
    }
  }

  /**
   * Gets all active alarms.
   */
  private async getAllAlarms(): Promise<chrome.alarms.Alarm[]> {
    try {
      return new Promise((resolve) => {
        chrome.alarms.getAll((alarms) => {
          if (chrome.runtime.lastError) {
            this.debugService.error(
              '[AlarmService] Error getting all alarms:',
              chrome.runtime.lastError
            );
            resolve([]);
            return;
          }

          this.debugService.log(`[AlarmService] Found ${alarms?.length || 0} active alarms`);
          resolve(alarms || []);
        });
      });
    } catch (error) {
      this.debugService.error('[AlarmService] Error getting all alarms:', error);
      return [];
    }
  }

  /**
   * Clears all alarms.
   */
  async clearAllAlarms(): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        chrome.alarms.clearAll((wasCleared) => {
          if (chrome.runtime.lastError) {
            this.debugService.error(
              '[AlarmService] Error clearing all alarms:',
              chrome.runtime.lastError
            );
            resolve(false);
            return;
          }

          this.debugService.log('[AlarmService] All alarms cleared');
          resolve(wasCleared || false);
        });
      });
    } catch (error) {
      this.debugService.error('[AlarmService] Error clearing all alarms:', error);
      return false;
    }
  }

  /**
   * Clears a single alarm by name.
   */
  async clearAlarm(name: string): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        chrome.alarms.clear(name, (wasCleared) => {
          if (chrome.runtime.lastError) {
            this.debugService.error(
              `[AlarmService] Error clearing alarm '${name}':`,
              chrome.runtime.lastError
            );
            resolve(false);
            return;
          }
          this.debugService.log(`[AlarmService] Alarm '${name}' cleared: ${wasCleared}`);
          resolve(wasCleared || false);
        });
      });
    } catch (error) {
      this.debugService.error(`[AlarmService] Error clearing alarm '${name}':`, error);
      return false;
    }
  }

  /**
   * Replaces the production fetch alarm with a custom interval for dev testing.
   * Minimum interval is enforced to prevent abuse.
   */
  async overrideFetchAlarm(intervalMs: number): Promise<void> {
    const safeInterval = this.clampDevOverrideIntervalMs(intervalMs);
    const periodInMinutes = this.intervalMsToAlarmMinutes(safeInterval);

    try {
      await this.clearAlarm(EVENT_FETCH_PRS);
      await this.createAlarm(EVENT_FETCH_PRS, { periodInMinutes });
      await this.setOverrideState({ overridden: true, intervalMs: safeInterval });

      this.debugService.log(
        `[AlarmService] Fetch alarm overridden to ${safeInterval}ms (${periodInMinutes} min)`
      );
    } catch (error) {
      this.debugService.error('[AlarmService] Error overriding fetch alarm:', error);
      throw error;
    }
  }

  /**
   * Restores the fetch alarm to the default production interval.
   */
  async restoreFetchAlarm(): Promise<void> {
    try {
      await this.clearAlarm(EVENT_FETCH_PRS);
      await this.setOverrideState({ overridden: false, intervalMs: null });

      const intervalMs = await this.getEffectiveFetchIntervalMs();
      const periodInMinutes = this.intervalMsToAlarmMinutes(intervalMs);
      await this.createAlarm(EVENT_FETCH_PRS, { periodInMinutes });

      this.debugService.log(
        `[AlarmService] Fetch alarm restored to production interval: ${periodInMinutes} min`
      );
    } catch (error) {
      this.debugService.error('[AlarmService] Error restoring fetch alarm:', error);
      throw error;
    }
  }

  async rescheduleFetchAlarmFromNow(): Promise<void> {
    try {
      const intervalMs = await this.getEffectiveFetchIntervalMs();
      const periodInMinutes = this.intervalMsToAlarmMinutes(intervalMs);

      await this.clearAlarm(EVENT_FETCH_PRS);
      await this.createAlarm(EVENT_FETCH_PRS, {
        delayInMinutes: periodInMinutes,
        periodInMinutes,
      });

      this.debugService.log(
        `[AlarmService] Fetch alarm rescheduled: next fire in ${periodInMinutes} min (manual refresh)`
      );
    } catch (error) {
      this.debugService.error('[AlarmService] Error rescheduling fetch alarm:', error);
      throw error;
    }
  }

  async isFetchAlarmOverridden(): Promise<boolean> {
    const state = await this.getOverrideState();
    return state.overridden;
  }

  /**
   * Gets alarm status and information.
   */
  async getAlarmStatus(): Promise<{
    totalAlarms: number;
    fetchAlarmActive: boolean;
    nextScheduledTime?: number;
    isOverridden: boolean;
    currentIntervalMs?: number;
  }> {
    try {
      const allAlarms = await this.getAllAlarms();
      const fetchAlarm = await this.getAlarm(EVENT_FETCH_PRS);
      const overrideState = await this.getOverrideState();
      const currentIntervalMs = this.resolveEffectiveFetchIntervalMs(overrideState);

      const status = {
        totalAlarms: allAlarms.length,
        fetchAlarmActive: !!fetchAlarm,
        nextScheduledTime: fetchAlarm?.scheduledTime,
        isOverridden: overrideState.overridden,
        currentIntervalMs,
      };

      this.debugService.log('[AlarmService] Alarm status:', status);
      return status;
    } catch (error) {
      this.debugService.error('[AlarmService] Error getting alarm status:', error);
      return {
        totalAlarms: 0,
        fetchAlarmActive: false,
        isOverridden: false,
      };
    }
  }

  /**
   * Disposes the alarm service.
   */
  async dispose(): Promise<void> {
    this.debugService.log('[AlarmService] Alarm service disposed');
    this.initialized = false;
  }
}

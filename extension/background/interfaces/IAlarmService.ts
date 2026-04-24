import type { IService } from './IService';
import type { Alarm, AlarmCreateInfo } from '@common/chrome-extension-service';

/**
 * Interface for the alarm service that handles Chrome extension alarms.
 */
export interface IAlarmService extends IService {
  /**
   * Sets up the fetch alarm for periodic PR fetching.
   */
  setupFetchAlarm(): Promise<void>;

  /**
   * Creates a new alarm with the given name and configuration.
   */
  createAlarm(name: string, alarmInfo: AlarmCreateInfo): Promise<void>;

  /**
   * Gets an existing alarm by name.
   */
  getAlarm(name: string): Promise<Alarm | undefined>;

  /**
   * Clears a single alarm by name.
   */
  clearAlarm(name: string): Promise<boolean>;

  /**
   * Replaces the fetch alarm with a custom interval (for dev/test override).
   * @param intervalMs - The new interval in milliseconds (minimum 10 seconds).
   */
  overrideFetchAlarm(intervalMs: number): Promise<void>;

  /**
   * Restores the fetch alarm to the default production interval.
   */
  restoreFetchAlarm(): Promise<void>;

  /**
   * Clears and recreates the periodic fetch alarm so the next fire is a full
   * interval from now (production or dev override). Use after manual refresh
   * to avoid overlapping with the scheduled alarm.
   */
  rescheduleFetchAlarmFromNow(): Promise<void>;

  /**
   * Returns whether the fetch alarm is currently overridden.
   */
  isFetchAlarmOverridden(): Promise<boolean>;

  /**
   * Gets alarm status and information.
   */
  getAlarmStatus(): Promise<{
    totalAlarms: number;
    fetchAlarmActive: boolean;
    nextScheduledTime?: number;
    isOverridden: boolean;
    currentIntervalMs?: number;
  }>;
}

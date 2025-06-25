/**
 * Interface for the alarm service that handles Chrome extension alarms.
 */
export interface IAlarmService {
  /**
   * Sets up the fetch alarm for periodic PR fetching.
   */
  setupFetchAlarm(): Promise<void>;

  /**
   * Handles alarm events when they trigger.
   */
  handleAlarm(alarm: chrome.alarms.Alarm): Promise<void>;

  /**
   * Creates a new alarm with the given name and configuration.
   */
  createAlarm(name: string, alarmInfo: chrome.alarms.AlarmCreateInfo): Promise<void>;

  /**
   * Gets an existing alarm by name.
   */
  getAlarm(name: string): Promise<chrome.alarms.Alarm | undefined>;

  /**
   * Clears an alarm by name.
   */
  clearAlarm(name: string): Promise<boolean>;

  /**
   * Gets all active alarms.
   */
  getAllAlarms(): Promise<chrome.alarms.Alarm[]>;

  /**
   * Initializes the alarm service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the alarm service.
   */
  dispose(): Promise<void>;
}

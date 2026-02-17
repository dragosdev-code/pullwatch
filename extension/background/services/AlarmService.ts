import type { IAlarmService } from '../interfaces/IAlarmService';
import type { IDebugService } from '../interfaces/IDebugService';
import { EVENT_FETCH_PRS, FETCH_INTERVAL_MS } from '../../common/constants';

/**
 * AlarmService handles Chrome extension alarm scheduling and management.
 * Manages periodic tasks like PR fetching through Chrome's alarm API.
 */
export class AlarmService implements IAlarmService {
  private debugService: IDebugService;
  private initialized = false;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  /**
   * Initializes the alarm service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[AlarmService] Alarm service initialized');
  }

  /**
   * Sets up the fetch alarm for periodic PR fetching.
   */
  async setupFetchAlarm(): Promise<void> {
    try {
      this.debugService.log('[AlarmService] Setting up fetch alarm...');

      const existingAlarm = await this.getAlarm(EVENT_FETCH_PRS);

      if (existingAlarm) {
        this.debugService.log('[AlarmService] Fetch alarm already exists:', existingAlarm);
        return;
      }

      const periodInMinutes = FETCH_INTERVAL_MS / (60 * 1000);

      await this.createAlarm(EVENT_FETCH_PRS, {
        periodInMinutes,
      });

      this.debugService.log(
        `[AlarmService] Fetch alarm created with period: ${periodInMinutes} minutes`
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
   * Gets alarm status and information.
   */
  async getAlarmStatus(): Promise<{
    totalAlarms: number;
    fetchAlarmActive: boolean;
    nextScheduledTime?: number;
  }> {
    try {
      const allAlarms = await this.getAllAlarms();
      const fetchAlarm = await this.getAlarm(EVENT_FETCH_PRS);

      const status = {
        totalAlarms: allAlarms.length,
        fetchAlarmActive: !!fetchAlarm,
        nextScheduledTime: fetchAlarm?.scheduledTime,
      };

      this.debugService.log('[AlarmService] Alarm status:', status);
      return status;
    } catch (error) {
      this.debugService.error('[AlarmService] Error getting alarm status:', error);
      return {
        totalAlarms: 0,
        fetchAlarmActive: false,
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

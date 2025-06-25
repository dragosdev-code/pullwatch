import type { ServiceContainer } from '../core/ServiceContainer';
import { IAlarmService } from '../interfaces/IAlarmService';
import { IBadgeService } from '../interfaces/IBadgeService';
import { IDebugService } from '../interfaces/IDebugService';
import { IPermissionService } from '../interfaces/IPermissionService';
import { IPRService } from '../interfaces/IPRService';

/**
 * BackgroundManager orchestrates all services and handles Chrome extension lifecycle.
 * This is the main controller that coordinates service interactions and manages
 * extension events like installation, startup, and runtime messages.
 */
export class BackgroundManager {
  private serviceContainer: ServiceContainer;
  private initialized = false;

  constructor(serviceContainer: ServiceContainer) {
    this.serviceContainer = serviceContainer;
  }

  /**
   * Initializes the background manager and all services.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize service container and all services
      await this.serviceContainer.initialize();

      // Perform initial setup tasks
      await this.performInitialSetup();

      this.initialized = true;
      this.debugLog('[BackgroundManager] Successfully initialized');
    } catch (error) {
      this.debugError('[BackgroundManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Performs initial setup tasks like permission checks and alarms.
   */
  private async performInitialSetup(): Promise<void> {
    const permissionService =
      this.serviceContainer.getService<IPermissionService>('permissionService');
    const alarmService = this.serviceContainer.getService<IAlarmService>('alarmService');
    const prService = this.serviceContainer.getService<IPRService>('prService');
    const badgeService = this.serviceContainer.getService<IBadgeService>('badgeService');

    try {
      // Check permissions
      await permissionService.checkAllPermissions();

      // Setup alarms
      await alarmService.setupFetchAlarm();

      // Set initial badge state
      await badgeService.setDefaultBadge();

      // Perform initial PR fetch
      await prService.fetchAndUpdatePRs(true);

      this.debugLog('[BackgroundManager] Initial setup completed');
    } catch (error) {
      this.debugError('[BackgroundManager] Error during initial setup:', error);
      // Don't re-throw as this is non-critical for basic functionality
    }
  }

  /**
   * Gracefully shuts down the background manager and all services.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.serviceContainer.dispose();
      this.initialized = false;
      this.debugLog('[BackgroundManager] Successfully disposed');
    } catch (error) {
      this.debugError('[BackgroundManager] Error during disposal:', error);
    }
  }

  /**
   * Helper method for debug logging.
   */
  private debugLog(message: string, ...args: unknown[]): void {
    try {
      const debugService = this.serviceContainer.getService<IDebugService>('debugService');
      debugService.log(message, ...args);
    } catch {
      console.log(message, ...args);
    }
  }

  /**
   * Helper method for debug error logging.
   */
  private debugError(message: string, ...args: unknown[]): void {
    try {
      const debugService = this.serviceContainer.getService<IDebugService>('debugService');
      debugService.error(message, ...args);
    } catch {
      console.error(message, ...args);
    }
  }
}

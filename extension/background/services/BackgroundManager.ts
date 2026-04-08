import type { ServiceContainer } from '../core/ServiceContainer';

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
   * Performs infrastructure setup: permissions, alarms, and badge hydration from storage.
   *
   * WHY this method must NOT fetch or seed PR data:
   *
   * MV3 service workers terminate after ~30 s of inactivity. Every time
   * Chrome wakes the worker (alarm, message, etc.) the module-level code in
   * main.ts runs from scratch — creating a **new** BackgroundManager whose
   * `this.initialized` is `false`. That means this method executes on
   * **every** wake, not just on install or browser startup.
   *
   * Fetching PRs here with `forceRefresh=true` would write the latest data
   * to chrome.storage.local while suppressing notifications. The alarm
   * handler that runs moments later would then compare fresh GitHub data
   * against that just-seeded storage — finding zero new PRs and never
   * firing a notification (the desktop alert is silently lost).
   *
   * Initial PR seeding belongs exclusively in the `onInstalled` (install /
   * update) and `onStartup` (browser profile start) handlers in
   * EventService. Those Chrome events only fire on true lifecycle
   * transitions, not on routine alarm-triggered wakes, so they do not
   * interfere with the alarm handler's new-PR detection.
   */
  private async performInitialSetup(): Promise<void> {
    const permissionService = this.serviceContainer.getService('permissionService');
    const alarmService = this.serviceContainer.getService('alarmService');
    const prService = this.serviceContainer.getService('prService');

    try {
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();
      // WHY [ordering]: This runs on every wake before `EventService`; derive the badge from
      // storage here so it matches persisted PRs and health flags without coupling init to
      // GitHub or to whichever handler runs next.
      await prService.syncBadgeFromStorage();

      this.debugLog('[BackgroundManager] Initial setup completed');
    } catch (error) {
      this.debugError('[BackgroundManager] Error during initial setup:', error);
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
      const debugService = this.serviceContainer.getService('debugService');
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
      const debugService = this.serviceContainer.getService('debugService');
      debugService.error(message, ...args);
    } catch {
      console.error(message, ...args);
    }
  }
}

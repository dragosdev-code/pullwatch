import { MessageResponse, RuntimeMessage } from '../../common/types';
import type { ServiceContainer } from '../core/ServiceContainer';
import { IAlarmService } from '../interfaces/IAlarmService';
import { IBadgeService } from '../interfaces/IBadgeService';
import { IDebugService } from '../interfaces/IDebugService';
import { IEventService } from '../interfaces/IEventService';
import { INotificationService } from '../interfaces/INotificationService';
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

      // Setup Chrome extension event listeners
      this.setupEventListeners();

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
   * Sets up all Chrome extension event listeners.
   */
  private setupEventListeners(): void {
    const eventService = this.serviceContainer.getService<IEventService>('eventService');

    // Setup all event listeners through the event service
    eventService.setupEventListeners();

    this.debugLog('[BackgroundManager] Event listeners setup complete');
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
   * Handles extension installation and updates.
   */
  async handleInstallation(details: chrome.runtime.InstalledDetails): Promise<void> {
    this.debugLog('[BackgroundManager] Extension installed/updated:', details);

    const permissionService =
      this.serviceContainer.getService<IPermissionService>('permissionService');
    const alarmService = this.serviceContainer.getService<IAlarmService>('alarmService');
    const prService = this.serviceContainer.getService<IPRService>('prService');
    const badgeService = this.serviceContainer.getService<IBadgeService>('badgeService');

    try {
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();

      if (details.reason === 'install') {
        this.debugLog('[BackgroundManager] First install detected');
        await badgeService.setLoadingBadge();
      } else if (details.reason === 'update') {
        this.debugLog('[BackgroundManager] Extension updated');
      }

      // Perform initial fetch after installation/update
      await prService.fetchAndUpdatePRs(true);
    } catch (error) {
      this.debugError('[BackgroundManager] Error during installation handling:', error);
    }
  }

  /**
   * Handles extension startup.
   */
  async handleStartup(): Promise<void> {
    this.debugLog('[BackgroundManager] Extension startup');

    const permissionService =
      this.serviceContainer.getService<IPermissionService>('permissionService');
    const alarmService = this.serviceContainer.getService<IAlarmService>('alarmService');
    const prService = this.serviceContainer.getService<IPRService>('prService');

    try {
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();
      await prService.fetchAndUpdatePRs(true);
    } catch (error) {
      this.debugError('[BackgroundManager] Error during startup:', error);
    }
  }

  /**
   * Handles alarm events.
   */
  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    this.debugLog('[BackgroundManager] Alarm triggered:', alarm);

    const alarmService = this.serviceContainer.getService<IAlarmService>('alarmService');
    await alarmService.handleAlarm(alarm);
  }

  /**
   * Handles notification clicks.
   */
  async handleNotificationClick(notificationId: string): Promise<void> {
    this.debugLog('[BackgroundManager] Notification clicked:', notificationId);

    const notificationService =
      this.serviceContainer.getService<INotificationService>('notificationService');
    await notificationService.handleNotificationClick(notificationId);
  }

  /**
   * Handles runtime messages.
   */
  async handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    this.debugLog('[BackgroundManager] Message received:', message);

    const eventService = this.serviceContainer.getService<IEventService>('eventService');
    await eventService.handleMessage(message, sender, sendResponse);
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

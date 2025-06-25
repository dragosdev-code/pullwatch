import type { RuntimeMessage, MessageResponse } from '../../common/types';

/**
 * Event service interface for managing Chrome extension events and messages.
 * Coordinates between different services and handles Chrome extension lifecycle events.
 */
export interface IEventService {
  /**
   * Initializes the event service and sets up event listeners.
   */
  initialize(): Promise<void>;

  /**
   * Sets up Chrome extension event listeners.
   */
  setupEventListeners(): Promise<void>;

  /**
   * Handles extension installation and updates.
   */
  handleInstallation(details: chrome.runtime.InstalledDetails): Promise<void>;

  /**
   * Handles extension startup.
   */
  handleStartup(): Promise<void>;

  /**
   * Handles alarm events.
   */
  handleAlarm(alarm: chrome.alarms.Alarm): Promise<void>;

  /**
   * Handles notification clicks.
   */
  handleNotificationClick(notificationId: string): Promise<void>;

  /**
   * Handles runtime messages.
   */
  handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean;

  /**
   * Handles PR data related actions (getPRs, fetchPRs).
   */
  handlePRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void>;

  /**
   * Handles settings related actions (saveSettings, getSettings).
   */
  handleSettingsActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void>;

  /**
   * Handles offscreen related actions (sound playback, etc.).
   */
  handleOffscreenActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void>;

  /**
   * Handles test actions (test notifications).
   */
  handleTestActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void>;

  /**
   * Disposes the event service.
   */
  dispose(): Promise<void>;
}

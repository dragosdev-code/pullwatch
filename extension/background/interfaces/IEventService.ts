import type { RuntimeMessage, MessageResponse } from '../../common/types';
import type { IService } from './IService';

/**
 * Event service interface for managing Chrome extension events and messages.
 * Only exposes the five top-level entry points called from main.ts.
 * Internal routing handlers (handleAssignedPRDataActions, etc.) remain on
 * the class for testability but are not part of the interface contract.
 */
export interface IEventService extends IService {
  handleInstallation(details: chrome.runtime.InstalledDetails): Promise<void>;
  handleStartup(): Promise<void>;
  handleAlarm(alarm: chrome.alarms.Alarm): Promise<void>;
  handleNotificationClick(notificationId: string): Promise<void>;

  /**
   * Dispatches a Chrome runtime message to the appropriate handler.
   * Returns void -- main.ts owns the `return true` for the Chrome API contract.
   */
  handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): void;
}

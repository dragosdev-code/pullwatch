// extension/common/types.ts
import type {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_USER_DATA,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
} from './constants';

/**
 * Available notification sounds
 */
export type NotificationSound = 'ping' | 'bell' | 'off';

/**
 * Settings for assigned PR notifications and display
 */
export interface AssignedSettings {
  notificationsEnabled: boolean;
  notifyOnDrafts: boolean;
  sound: NotificationSound;
  showDraftsInList: boolean;
}

/**
 * Settings for merged PR notifications
 */
export interface MergedSettings {
  notificationsEnabled: boolean;
  sound: NotificationSound;
}

/**
 * Settings for authored PRs (reserved for future use)
 */
export interface AuthoredSettings {
  notificationsEnabled: boolean;
  sound: NotificationSound;
}

// Represents the structure of a Pull Request
export interface PullRequest {
  id: string; // Unique identifier, could be the URL or a combination of repo and number
  url: string;
  title: string;
  number: number | null;
  repoName: string;
  author: {
    login: string;
    avatarUrl?: string;
  };
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
  labels?: string[];
  isNew?: boolean; // Helper flag for notifications
  html_url?: string; // This is often the same as url, from GitHub API
  type: 'draft' | 'open' | 'merged';
  reviewStatus?: 'pending' | 'reviewed';
  authorReviewStatus?: 'approved' | 'changes_requested' | 'pending' | 'commented' | 'draft';
}

// Represents the structure of stored PR data
export interface StoredPRs {
  prs: PullRequest[];
  lastUpdated: string; // ISO date string
}

// For browser.storage.local.get/set operations
export interface StorageItems {
  [STORAGE_KEY_ASSIGNED_PRS]?: StoredPRs;
  [STORAGE_KEY_MERGED_PRS]?: StoredPRs;
  [STORAGE_KEY_AUTHORED_PRS]?: StoredPRs;
  [STORAGE_KEY_LAST_FETCH]?: number; // Timestamp
  [STORAGE_KEY_SETTINGS]?: ExtensionSettings;
  [STORAGE_KEY_USER_DATA]?: UserData;
  // Allow any string as a key for flexibility
  [key: string]: unknown;
}

export type StorageKeyPRs =
  | typeof STORAGE_KEY_ASSIGNED_PRS
  | typeof STORAGE_KEY_MERGED_PRS
  | typeof STORAGE_KEY_AUTHORED_PRS;

export interface StorageKeyMap {
  [STORAGE_KEY_ASSIGNED_PRS]: StoredPRs;
  [STORAGE_KEY_MERGED_PRS]: StoredPRs;
  [STORAGE_KEY_AUTHORED_PRS]: StoredPRs;
  [STORAGE_KEY_LAST_FETCH]: number;
  [STORAGE_KEY_SETTINGS]: ExtensionSettings;
}

/**
 * Notification category for type-safe category-specific operations
 */
export type NotificationCategory = 'assigned' | 'merged' | 'authored';

/**
 * Settings for the extension
 * Uses a category-based structure for notification settings
 */
export interface ExtensionSettings {
  /** Assigned PR notification and display settings */
  assigned: AssignedSettings;
  /** Merged PR notification settings */
  merged: MergedSettings;
  /** Authored PR notification settings (reserved for future use) */
  authored: AuthoredSettings;
  /** Fetch interval in milliseconds (applies to all PR types) */
  fetchInterval: number;
}

// User-specific data (example)
export interface UserData {
  githubUsername?: string;
  lastLogin?: string; // ISO date string
}

// Generic message structure for runtime communication
export interface RuntimeMessage<T = unknown> {
  action: string; // Corresponds to an EVENT_* from constants.ts
  payload?: T;
}

// Specific message payloads
export interface PlaySoundPayload {
  soundUrl?: string; // Optional: URL to a custom sound file
}

export interface FetchPRsPayload {
  forceRefresh?: boolean;
}

// Response structure for messages
export interface MessageResponse<R = unknown, E = unknown> {
  success: boolean;
  data?: R;
  error?: E;
}

// Type for functions handling messages
export type MessageHandler = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => boolean | undefined | Promise<void>; // Return true for async sendResponse

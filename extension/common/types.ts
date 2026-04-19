// extension/common/types.ts
import type {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_USER_DATA,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
} from './constants';
import type { BroadcastAction, RequestRuntimeAction, RuntimeAction } from './runtime-actions';

export type { BroadcastAction, RequestRuntimeAction, RuntimeAction };

/**
 * Available notification sounds
 */
export type BuiltInSound = 'ping' | 'bell';
export type CustomSoundId = `custom_${number}`;
export type NotificationSound = BuiltInSound | CustomSoundId | 'off';

/**
 * Metadata for a user-uploaded custom notification sound.
 * Stored as an array in chrome.storage.local under STORAGE_KEY_CUSTOM_SOUNDS_META.
 * The actual audio data (Base64 WAV) is stored separately under the storageKey.
 */
export interface CustomSoundMeta {
  id: CustomSoundId;
  name: string;
  durationMs: number;
  createdAt: string;
  storageKey: string;
}

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

/** Person shown on a PR row (assignees from AvatarStack when present; else opener heuristics). */
export interface PullRequestAuthor {
  login: string;
  avatarUrl?: string;
}

// Represents the structure of a Pull Request
export interface PullRequest {
  id: string; // Unique identifier, could be the URL or a combination of repo and number
  url: string;
  title: string;
  number: number | null;
  repoName: string;
  /** Assignee stack when GitHub renders AvatarStack (“Assigned to …”); otherwise one opener-derived entry. */
  author: PullRequestAuthor[];
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
  [STORAGE_KEY_PR_FETCH_IN_PROGRESS]?: boolean;
  [STORAGE_KEY_SETTINGS]?: ExtensionSettings;
  [STORAGE_KEY_USER_DATA]?: UserData;
  [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]?: GitHubViewerIdentity;
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
  [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: GitHubViewerIdentity;
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
}

// User-specific data (example)
export interface UserData {
  githubUsername?: string;
  lastLogin?: string; // ISO date string
}

/** Last known GitHub web-session login; compared on each fetch to detect account swap. */
export interface GitHubViewerIdentity {
  login: string;
  updatedAt?: string;
}

/** Request-style runtime message (`payload`; used by popup, background, offscreen). */
export type RuntimeRequestMessage<T = unknown> = {
  action: RequestRuntimeAction;
  payload?: T;
};

/** Background → UI broadcast (`data`, not `payload`). */
export type RuntimeBroadcastMessage = {
  action: BroadcastAction;
  data: unknown;
};

export type RuntimeMessage = RuntimeRequestMessage | RuntimeBroadcastMessage;

// Response structure for messages
export interface MessageResponse<R = unknown, E = unknown> {
  success: boolean;
  data?: R;
  error?: E;
}

/**
 * Payload for settings-page notification test (`SETTINGS_ACTION.testSettingsNotification`).
 * `assigned` is the "To Review PRs" notification channel (review requests).
 */
export interface SettingsNotificationTestPayload {
  category: 'assigned' | 'merged';
}

// ─── Dev Test Area Types ─────────────────────────────────────────────────────

export interface DevTestNotificationOverrides {
  title?: string;
  message?: string;
  sound?: NotificationSound;
}

export interface DevTestLooperState {
  intervalMs: number;
  isRunning: boolean;
  sentCount: number;
}

export interface DevTestAlarmOverrideState {
  intervalMs: number;
  isOverridden: boolean;
}

export interface DevTestSettings {
  notification: {
    title: string;
    message: string;
    sound: NotificationSound;
  };
  looper: {
    intervalMs: number;
  };
  alarmOverride: {
    intervalMs: number;
  };
}

export interface ScraperUrl {
  label: string;
  url: string;
}

// extension/common/types.ts
import type {
  STORAGE_KEY_PRS,
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_USER_DATA,
  STORAGE_KEY_MERGED_PRS,
} from './constants';

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
}

// Represents the structure of stored PR data
export interface StoredPRs {
  prs: PullRequest[];
  lastUpdated: string; // ISO date string
}

// For browser.storage.local.get/set operations
export interface StorageItems {
  [STORAGE_KEY_PRS]?: StoredPRs;
  [STORAGE_KEY_MERGED_PRS]?: StoredPRs;
  [STORAGE_KEY_LAST_FETCH]?: number; // Timestamp
  [STORAGE_KEY_SETTINGS]?: ExtensionSettings;
  [STORAGE_KEY_USER_DATA]?: UserData;
  // Allow any string as a key for flexibility
  [key: string]: unknown;
}

// Settings for the extension
export interface ExtensionSettings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  fetchInterval: number; // In milliseconds
  // Add other settings as needed
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

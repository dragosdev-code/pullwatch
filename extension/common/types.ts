// extension/common/types.ts
import type {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE,
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_MINIGAME_STATS,
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
  /**
   * Timestamp used for notification freshness checks. HTML parsers only set this when the DOM
   * exposes a valid ISO datetime; `createdAt` may still fall back to "now" for legacy UI sorting.
   */
  eventAt?: string;
  /** Source semantics for `eventAt`; merged-list rows may only expose a generic list timestamp. */
  eventAtKind?: 'created' | 'updated' | 'merged' | 'unknown';
  /** True when the row parsed but its DOM timestamp was missing or malformed. */
  timestampParseFailed?: boolean;
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
  [STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE]?: boolean;
  [STORAGE_KEY_SETTINGS]?: ExtensionSettings;
  [STORAGE_KEY_USER_DATA]?: UserData;
  [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]?: GitHubViewerIdentity;
  [STORAGE_KEY_MINIGAME_STATS]?: MinigameStats;
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
  [STORAGE_KEY_MINIGAME_STATS]: MinigameStats;
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
  /** Authored tab list/display settings only — desktop notifications are not implemented for authored PRs. */
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

/** Squash the Bugs minigame: gameplay variant selected from the launcher. */
export type GameMode = 'standard' | 'legacy' | 'scopeCreep' | 'fridayDeploy';

/** Per-mode persistent stats accumulated across all rounds of that variant. */
export interface MinigameModeStats {
  playCount: number;
  highScore: number;
  highestCombo: number;
}

/**
 * Squash the Bugs minigame storage blob.
 *
 * WHY [popupOpenCount lives here]: keeps the entire feature behind one storage key for atomic
 * reads/writes; the open counter increments with each popup launch while `hasDiscovered` is a
 * separate explicit opt-in written from the popup UI.
 *
 * WHY [lastPlayedMode optional]: undefined until the first round finishes; pre-seeding a mode
 * before any play would misrepresent state for the launcher UI added in Phase 5.
 *
 * WHY [hasSeenSquashQuickStart]: one-time onboarding + mode pick from the header CTA; persisted
 * so repeat opens skip the intro. Settings / other entry points can reuse the same flag later.
 */
export interface MinigameStats {
  /**
   * Schema version stamp. Bumped on any field addition or structural change so
   * {@link ensureCompleteMinigameStats} can detect stale blobs and apply targeted migrations
   * instead of resetting the entire object.
   *
   * Version history:
   *   1 — initial schema (hasDiscovered, popupOpenCount, modes, overall).
   *   2 — added hasSeenSquashQuickStart, lastPlayedMode, dataVersion itself.
   */
  dataVersion: number;
  hasDiscovered: boolean;
  /** After the user completes the header quick-start flow (info + mode + Start). */
  hasSeenSquashQuickStart: boolean;
  popupOpenCount: number;
  lastPlayedMode?: GameMode;
  overall: {
    totalBugsSquashed: number;
    totalFeaturesBroken: number;
    totalTimePlayedSeconds: number;
  };
  modes: Record<GameMode, MinigameModeStats>;
}

/**
 * Serializable snapshot of an in-flight game session, persisted to chrome.storage.local so a
 * popup close mid-round does not lose progress.
 *
 * WHY [wall-clock `savedAt`]: on resume, `savedAt` lets the store compute how long the popup
 * was closed so it can subtract that dead time from `elapsedMs` rather than pretending the
 * player was idle the whole time. `timeRemainingMs` is the authoritative remaining time.
 */
export interface MinigameSessionCheckpoint {
  mode: GameMode;
  score: number;
  combo: number;
  highestCombo: number;
  bugsSquashed: number;
  featuresBroken: number;
  elapsedMs: number;
  timeRemainingMs: number;
  gridSize: number;
  savedAt: number;
}

/**
 * Discriminator on the persisted `STORAGE_KEY_GITHUB_OUTAGE` payload.
 *
 * - `'transport'`: GitHubOutageError caught in `PrFetchErrorHandler` (5xx, network, timeout).
 *   Signaled regardless of Statuspage; popup may still hide the Statuspage link unless the cached
 *   `STORAGE_KEY_GITHUB_STATUS_CACHE` snapshot independently corroborates an incident.
 * - `'pr_component_degraded'`: PR-list integrity anomaly that Statuspage independently corroborates
 *   (component partial/major outage, or a non-trivial `globalIndicator`); the only branch that also
 *   sets `STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT`.
 * - `'pr_list_churn'`: post-hoc tombstone resurrection signal — independent of Statuspage. The
 *   popup must not invite users to githubstatus.com here, since the page is often green while
 *   we are still showing this banner.
 * - `'site_access_blocked'`: Chrome is blocking github.com requests because the user disabled
 *   per-site access for the extension (chrome://extensions → "Allow access on click" / "On
 *   specific sites"). Two writers: `PrFetchErrorHandler` runs `chrome.permissions.contains`
 *   against `https://github.com/*` at error time (see
 *   `extension/common/site-access-classifier.ts`); `SiteAccessWatcher` listens for
 *   `chrome.permissions.onRemoved` so a runtime toggle flips the banner before the next fetch
 *   wave. Statuspage link is suppressed; the banner points the user at chrome://extensions
 *   instead.
 *
 * Lives in `@common/` so the popup can branch on it without reaching into `@background/`.
 */
export type GitHubOutageReason =
  | 'transport'
  | 'pr_component_degraded'
  | 'pr_list_churn'
  | 'site_access_blocked';

/** Persisted payload shape under `STORAGE_KEY_GITHUB_OUTAGE`; also the broadcast `data` for `githubOutageDetected`. */
export interface GitHubOutagePayload {
  detected: true;
  /** First detection time for the active outage window; kept stable so context/reason copy is consistent. */
  timestamp: number;
  /** Last time the background still observed the outage; popup uses this to age out stale stored flags. */
  lastSeenAt: number;
  context: string;
  reason: GitHubOutageReason;
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

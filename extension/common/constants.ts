// extension/common/constants.ts

// Storage Keys
export const STORAGE_KEY_ASSIGNED_PRS = 'github_assigned_prs';
export const STORAGE_KEY_MERGED_PRS = 'github_merged_prs';
export const STORAGE_KEY_AUTHORED_PRS = 'github_authored_prs';
export const STORAGE_KEY_LAST_FETCH = 'last_fetch_time';
/** True while the background is running an alarm or manual GitHub fetch cycle (popup reads via storage.onChanged). */
export const STORAGE_KEY_PR_FETCH_IN_PROGRESS = 'pr_fetch_in_progress';
export const STORAGE_KEY_SETTINGS = 'settings'; // As per requirements
export const STORAGE_KEY_USER_DATA = 'user_data'; // Example, can be expanded
export const STORAGE_KEY_PATTERN_REGISTRY = 'parser_pattern_registry';
export const STORAGE_KEY_PARSER_BREAKAGE = 'parser_breakage';
export const STORAGE_KEY_GITHUB_OUTAGE = 'github_outage';
/**
 * WHY [metadata only]: Set when the outage gate ({@link PRService.isOutageSuspectedEmpty}) declines
 * to trust an empty fetch. Distinct from {@link STORAGE_KEY_LAST_FETCH} ("last *successful* fetch").
 * Cleared with the outage flag when `HealthStatusService` clears GitHub outage. The popup’s
 * `useGitHubOutage` hook reads this for the outage-banner subline (does not overwrite PR arrays).
 */
export const STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT = 'last_untrusted_fetch_at';
/**
 * Trust metadata for PR-list polling. Stores limbo rows and last trusted counts separately from
 * `StoredPRs` so suspicious successful reads cannot overwrite last-known-good PR arrays.
 */
export const STORAGE_KEY_PR_LIST_TRUST = 'pr_list_trust_state';
/** Cached `summary.json` snapshot from githubstatus.com (TTL {@link GITHUB_STATUS_CACHE_TTL_MS}). */
export const STORAGE_KEY_GITHUB_STATUS_CACHE = 'github_status_cache';
/**
 * Per-list bounded tombstone log used by `PrTombstoneStore` to detect resurrection
 * (a PR key disappearing from one wave's fresh list and returning within the alarm window).
 *
 * WHY [versioned key]: shape may evolve (e.g. richer per-tombstone metadata); the `_v1` suffix lets
 * us migrate without colliding with stale storage from older builds.
 */
export const STORAGE_KEY_PR_TOMBSTONES = 'pr_tombstones_v1';
/**
 * Monotonic alarm sequence advanced once per completed alarm wave by `EventService`.
 *
 * WHY [alarm-anchored not wall-clock]: tombstone TTL is "4 alarm intervals" — manual refreshes
 * between alarms must NOT consume window slots, otherwise a user mashing refresh would expire
 * tombstones prematurely. Stored separately from `STORAGE_KEY_PR_TOMBSTONES` so corruption in one
 * does not block the other.
 */
export const STORAGE_KEY_ALARM_SEQ = 'pr_tombstone_alarm_seq';
/**
 * A tombstone is alive while `currentAlarmSeq - droppedAtAlarmSeq <= TOMBSTONE_ALARM_WINDOW`.
 * Strict-greater on the right keeps the tombstone alive through exactly four subsequent waves.
 */
export const TOMBSTONE_ALARM_WINDOW = 4;
/**
 * Merged-list shrink at or above this row count routes through the suspect_partial branch even when
 * the assessor's `partialDropFlavor === 'operational'`.
 *
 * WHY [merged stays strict]: merged is append-heavy; losing >= 4 rows in one tick is the
 * GitHub-side incompleteness pattern, not legitimate churn. Assigned/authored, by contrast, accept
 * operational shrink so bulk merges land in the popup immediately.
 */
export const MERGED_SHRINK_SUSPICION_THRESHOLD = 4;
/**
 * LRU bound per list on the tombstone log. Guards against unbounded growth on pathological churn
 * (e.g. flapping repo with hundreds of distinct PRs per day).
 */
export const PR_TOMBSTONE_MAX_ENTRIES_PER_LIST = 200;
export const STORAGE_KEY_ROUTE_HINT = 'pulls_list_route_hint';
/** Parsed GitHub session login for account-swap detection vs PR cache (see PRService silent baseline). */
export const STORAGE_KEY_GITHUB_VIEWER_IDENTITY = 'github_viewer_identity';
/** Popup first-run reveal; written once per install (see use-onboarding). */
export const STORAGE_KEY_HAS_SEEN_ONBOARDING = 'has_seen_onboarding';
/**
 * Set when the GitHub web session caches are cleared so the popup shows the onboarding reveal
 * again after the next successful login, even if `has_seen_onboarding` is already true.
 */
export const STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING = 'onboarding_reauth_gate_pending';
/**
 * Set `true` once the install-time GitHub session probe settles (success *or* auth fail).
 * Distinct from {@link STORAGE_KEY_PR_FETCH_IN_PROGRESS}, which also flips during alarm/manual
 * fetches; this one exists solely so the popup can distinguish "still checking on first install"
 * from "checked, genuinely logged out" and render a dedicated checking phase vs LoggedOutView.
 */
export const STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE = 'install_session_check_complete';

// Remote Pattern Registry
// Production config — raw file on the main branch, served directly by GitHub.
export const REMOTE_PATTERNS_URL =
  'https://raw.githubusercontent.com/dragosdev-code/pr-live-config/main/patterns.json';
// Staging config — raw file on the staging branch. Used by the schema smoke
// test to validate config changes before they are merged to main.
export const REMOTE_PATTERNS_STAGING_URL =
  'https://raw.githubusercontent.com/dragosdev-code/pr-live-config/staging/patterns.json';
export const PATTERN_REFRESH_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
// WHY [supply-chain]: Remote regex config is data, not code, but a compromised
// config host must not be able to make the service worker allocate unbounded JSON.
export const REMOTE_PATTERNS_MAX_BYTES = 1 * 1024 * 1024; // 1 MiB
// WHY [recovery]: A bounded jump keeps hotfix room while preventing a poisoned
// remote version from pinning installs above all legitimate future releases.
export const REMOTE_PATTERNS_MAX_VERSION_DELTA = 1000;

// Route hint — remembers whether /pulls/search or /pulls last succeeded so
// steady-state polling makes one request per list instead of probing both.
export const ROUTE_HINT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const REMOTE_FETCH_TIMEOUT_MS = 10_000;

// Fetch Intervals
export const FETCH_INTERVAL_MINUTES = 3;
export const FETCH_INTERVAL_MS = FETCH_INTERVAL_MINUTES * 60 * 1000;

// Delay between sequential GitHub requests to avoid secondary rate limits
export const REQUEST_DELAY_MS = 1500;

// Cache TTL
export const CACHE_TTL_MS = 60 * 1000; // 1 minute

// Minimum time between manual refreshes to prevent rate limiting (30 seconds)
export const MIN_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

/** Unix ms of last allowed manual refresh wave start — written only by `EventService` to `chrome.storage.session`. */
export const STORAGE_KEY_LAST_MANUAL_REFRESH_AT = 'last_manual_refresh_at';

// GitHub fetch timeout — guarantees deduplication locks in PRService clear even if GitHub hangs
export const GITHUB_FETCH_TIMEOUT_MS = 30_000;

// GitHub Status API (https://www.githubstatus.com/api/v2)
export const GITHUB_STATUS_API_URL = 'https://www.githubstatus.com/api/v2/summary.json';
export const GITHUB_STATUS_FETCH_TIMEOUT_MS = 3_000;
export const GITHUB_STATUS_CACHE_TTL_MS = 120_000;
/** Defensive lookup target — matched case-insensitively against `components[].name` on summary.json. */
export const GITHUB_PR_COMPONENT_NAME = 'pull requests';

// Rate Limit
export const STORAGE_KEY_RATE_LIMIT = 'rate_limit_state';
export const RATE_LIMIT_MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes

// Offscreen Document
export const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'; // Updated path to be relative to dist root
export const OFFSCREEN_REASON_AUDIO_PLAYBACK = 'AUDIO_PLAYBACK';

// Custom Sounds
export const STORAGE_KEY_CUSTOM_SOUNDS_META = 'custom_sounds_meta';
export const CUSTOM_SOUND_STORAGE_PREFIX = 'custom_sound_';
export const MAX_CUSTOM_SOUNDS = 3;
export const MAX_CUSTOM_SOUND_DURATION_S = 5;
export const MAX_CUSTOM_SOUND_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CUSTOM_SOUND_NAME_LENGTH = 19;

// Notifications
export const NOTIFICATION_NEW_PR = 'newPRNotification';

/** Minimum delay between settings-page "Test" notification fires per category (UI mirrors this). */
export const SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS = 5000;

/**
 * After clearing a settings preview on macOS, wait briefly before `create` so Notification Center can release
 * the prior row; otherwise the next toast may be dropped while sound still runs.
 */
export const SETTINGS_PREVIEW_AFTER_CLEAR_MS = 120;

export const DEV_TEST_AREA_ENABLE_DELAY_MS = 5000;

/** Easter egg minigame stats blob (popup open count, discovery flag, scores). Local storage. */
export const STORAGE_KEY_MINIGAME_STATS = 'minigame_stats';
/** In-flight game checkpoint for pause/resume across popup close. Separate key from stats so corruption in one doesn't block the other. */
export const STORAGE_KEY_MINIGAME_SESSION_CHECKPOINT = 'minigame_session_checkpoint';
/** Popup opens required to flip {@link MinigameStats.hasDiscovered}. */
export const MINIGAME_DISCOVERY_THRESHOLD = 42;

/** Returned in message responses when settings test is rejected — UI can map to copy without string matching free text. */
export const SETTINGS_TEST_ERROR_COOLDOWN = 'SETTINGS_TEST_COOLDOWN';
export const SETTINGS_TEST_ERROR_DISABLED = 'SETTINGS_TEST_DISABLED';

/**
 * Returned when `chrome.notifications.getPermissionLevel()` reports `denied` for this extension —
 * Chrome (not necessarily the OS) is blocking notifications. Popup maps this to an inline notice
 * with unblock guidance; stable string across the service-worker ↔ popup message boundary.
 */
export const SETTINGS_TEST_ERROR_CHROME_DENIED = 'SETTINGS_TEST_CHROME_NOTIFICATIONS_DENIED';

// Permissions (example, expand as needed)
export const PERMISSION_STORAGE = 'storage';
export const PERMISSION_ALARMS = 'alarms';
export const PERMISSION_NOTIFICATIONS = 'notifications';
export const PERMISSION_OFFSCREEN = 'offscreen';

// URLs
export const GITHUB_BASE_URL = 'https://github.com';
// The query `user-review-requested:@me` searches for PRs where the authenticated user is requested for review.
export const GITHUB_REVIEW_REQUESTS_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+user-review-requested%3A%40me+`;

export const GITHUB_MERGED_PRS_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Apr+is%3Amerged+author%3A%40me`;

export const GITHUB_REVIEWED_PRS_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+reviewed-by%3A%40me+-user-review-requested%3A%40me+-author%3A%40me`;

// Authored PRs URLs - for PRs created by the user
export const GITHUB_AUTHORED_APPROVED_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+author%3A%40me+review%3Aapproved`;

export const GITHUB_AUTHORED_CHANGES_REQUESTED_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+author%3A%40me+review%3Achanges_requested`;

export const GITHUB_AUTHORED_PENDING_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+author%3A%40me+review%3Anone`;

// Note: GitHub doesn't properly support the 'review:commented' filter yet - it may return empty results
// This is a known limitation on GitHub's side, but we include it for future compatibility
export const GITHUB_AUTHORED_COMMENTED_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+author%3A%40me+review%3Acommented`;

export const GITHUB_AUTHORED_DRAFT_URL_TEMPLATE = (baseUrl: string) =>
  `${baseUrl}/pulls?q=is%3Aopen+draft%3Atrue+is%3Apr+author%3A%40me`;

// Badge
export const BADGE_COLOR_ACTIVE = '#ac52e0'; // Lavender
export const BADGE_TEXT_COLOR_ACTIVE = '#ffffff'; // White
export const BADGE_COLOR_INACTIVE = '#6c757d'; // Gray
export const BADGE_TEXT_COLOR_INACTIVE = '#ffffff'; // White
export const BADGE_TEXT_LOADING = '...';

// Misc
export const USER_AGENT = 'Mozilla/5.0 (compatible; Pullwatch)';

// Dev Test Area
export const STORAGE_KEY_DEV_TEST_SETTINGS = 'dev_test_settings';
export const STORAGE_KEY_ALARM_OVERRIDE = 'alarm_override_state';
export const DEV_TEST_MIN_LOOP_INTERVAL_MS = 1000;
export const DEV_TEST_MIN_ALARM_OVERRIDE_MS = 10_000;
export const DEV_TEST_NOTIFICATION_DEBOUNCE_MS = 1500;

import type { DevTestSettings } from './types';

export const DEFAULT_DEV_TEST_SETTINGS: DevTestSettings = {
  notification: {
    title: '',
    message: '',
    sound: 'ping',
  },
  looper: {
    intervalMs: 3000,
  },
  alarmOverride: {
    intervalMs: 60000,
  },
};

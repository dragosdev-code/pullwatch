// extension/common/constants.ts

// Storage Keys
export const STORAGE_KEY_PRS = 'github_prs';
export const STORAGE_KEY_MERGED_PRS = 'github_merged_prs';
export const STORAGE_KEY_LAST_FETCH = 'last_fetch_time';
export const STORAGE_KEY_SETTINGS = 'settings'; // As per requirements
export const STORAGE_KEY_USER_DATA = 'user_data'; // Example, can be expanded

// Fetch Intervals
export const FETCH_INTERVAL_MINUTES = 1;
export const FETCH_INTERVAL_MS = FETCH_INTERVAL_MINUTES * 60 * 1000;

// Event Names (from background.js and requirements)
export const EVENT_FETCH_PRS = 'fetchPRs';
export const EVENT_PLAY_SOUND = 'playNotificationSound'; // From offscreen.js
export const EVENT_OFFSCREEN_READY = 'offscreenReady'; // From offscreen.js
export const EVENT_USER_LOGGED_IN = 'userLoggedIn'; // As per requirements
export const EVENT_SETTINGS_UPDATED = 'settingsUpdated'; // Example

// Offscreen Document
export const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'; // Updated path to be relative to dist root
export const OFFSCREEN_REASON_AUDIO_PLAYBACK = 'AUDIO_PLAYBACK';

// Notifications
export const NOTIFICATION_NEW_PR = 'newPRNotification';

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
  `${baseUrl}/pulls?q=is%3Aopen+is%3Apr+reviewed-by%3A%40me+-user-review-requested%3A%40me`;

// Badge
export const BADGE_COLOR_ACTIVE = '#007bff'; // Blue
export const BADGE_COLOR_INACTIVE = '#6c757d'; // Gray
export const BADGE_TEXT_LOADING = '...';

// Misc
export const USER_AGENT = 'Mozilla/5.0 (compatible; GitHub PR Live Extension)';

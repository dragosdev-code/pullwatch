/**
 * Static copy for the user-facing "Test" notification on the settings page.
 * Titles and field roles match NotificationService.showPRNotificationsInternal (single-PR case) so the
 * preview matches real To Review / Merged alerts.
 */
export const SETTINGS_TEST_NOTIFICATION_COPY = {
  assigned: {
    title: 'New PR Review Request',
    message: '+10,432 / -0 lines. "Minor typo fix, PTAL"',
    contextMessage: 'acme/abyss by chaotic',
  },
  merged: {
    title: 'PR Merged!',
    message: 'Remove 142 console.log() statements before anyone notices',
    contextMessage: 'acme/prod-fire by you',
  },
} as const;

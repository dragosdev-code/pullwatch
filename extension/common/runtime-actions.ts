/**
 * Canonical string identifiers for Chrome runtime messaging, offscreen, and the fetch alarm.
 * Alarm name EVENT_FETCH_PRS is shared by the periodic alarm and the same fetch semantics elsewhere—not alarm-only.
 */

export const EVENT_FETCH_PRS = 'fetchPRs' as const;

export const PR_DATA_ACTION = {
  getAssignedPRs: 'getAssignedPRs',
  fetchAssignedPRs: 'fetchAssignedPRs',
  getMergedPRs: 'getMergedPRs',
  fetchMergedPRs: 'fetchMergedPRs',
  getAuthoredPRs: 'getAuthoredPRs',
  fetchAuthoredPRs: 'fetchAuthoredPRs',
} as const;

export const SETTINGS_ACTION = {
  saveSettings: 'saveSettings',
  getSettings: 'getSettings',
} as const;

export const OFFSCREEN_ACTION = {
  playNotificationSound: 'playNotificationSound',
  offscreenReady: 'offscreenReady',
} as const;

export const EVENT_PLAY_SOUND = OFFSCREEN_ACTION.playNotificationSound;
export const EVENT_OFFSCREEN_READY = OFFSCREEN_ACTION.offscreenReady;

export const PREVIEW_SOUND_ACTION = {
  previewSound: 'previewSound',
} as const;

export const DEV_TEST_ACTION = {
  fireNotification: 'devTest:fireNotification',
  startLoop: 'devTest:startLoop',
  stopLoop: 'devTest:stopLoop',
  getLooperState: 'devTest:getLooperState',
  overrideAlarm: 'devTest:overrideAlarm',
  restoreAlarm: 'devTest:restoreAlarm',
  getAlarmState: 'devTest:getAlarmState',
  getScraperUrls: 'devTest:getScraperUrls',
} as const;

export const BROADCAST_ACTION = {
  assignedPrDataUpdated: 'assignedPrDataUpdated',
  mergedPrDataUpdated: 'mergedPrDataUpdated',
  authoredPrDataUpdated: 'authoredPrDataUpdated',
  settingsUpdated: 'settingsUpdated',
  parserBreakageDetected: 'parserBreakageDetected',
  parserBreakageCleared: 'parserBreakageCleared',
} as const;

export const EVENT_SETTINGS_UPDATED = BROADCAST_ACTION.settingsUpdated;

/** All actions that can appear on runtime messages (popup/background/offscreen requests + background→UI broadcasts). */
export const RUNTIME_ACTION = {
  ...PR_DATA_ACTION,
  ...SETTINGS_ACTION,
  ...OFFSCREEN_ACTION,
  ...PREVIEW_SOUND_ACTION,
  ...DEV_TEST_ACTION,
  ...BROADCAST_ACTION,
} as const;

export type RuntimeAction = (typeof RUNTIME_ACTION)[keyof typeof RUNTIME_ACTION];

export type BroadcastAction = (typeof BROADCAST_ACTION)[keyof typeof BROADCAST_ACTION];

export type RequestRuntimeAction = Exclude<RuntimeAction, BroadcastAction>;

const broadcastValues = new Set<string>(Object.values(BROADCAST_ACTION));

export function isBroadcastAction(action: RuntimeAction): action is BroadcastAction {
  return broadcastValues.has(action);
}

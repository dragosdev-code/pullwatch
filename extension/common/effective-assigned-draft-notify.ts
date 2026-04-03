import type { AssignedSettings } from './types';

/**
 * Slice of {@link AssignedSettings} needed to decide whether draft PRs may trigger notifications.
 * Keys stay in sync with storage schema via `Pick`.
 */
export type AssignedDraftNotifySlice = Pick<AssignedSettings, 'notifyOnDrafts' | 'showDraftsInList'>;

/**
 * Effective "notify on drafts" for **assigned** PR notifications (service worker).
 *
 * WHY: When `showDraftsInList` is false, draft PRs are omitted from persisted assigned
 * storage (`PRService.mergeAndFilterAssignedPRs`). The next fetch then treats the same
 * draft as brand-new on every alarm tick → duplicate notifications forever.
 * The pair `(notifyOnDrafts && !showDraftsInList)` is therefore **invalid**; we must
 * never emit draft alerts in that configuration, even if legacy `chrome.storage` still
 * has `notifyOnDrafts: true`.
 */
export const effectiveAssignedNotifyOnDrafts = (assigned: AssignedDraftNotifySlice): boolean =>
  assigned.notifyOnDrafts && assigned.showDraftsInList;

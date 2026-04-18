import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ExtensionSettings } from '../../types';

export interface UseAssignedDraftNotifyListSyncParams {
  methods: UseFormReturn<ExtensionSettings>;
  /** Latest snapshot from `chrome.storage` (null while loading). */
  settings: ExtensionSettings | null | undefined;
  isLoading: boolean;
  /** Shared with the rest of settings: true while `reset(settings)` runs so autosave / transitions skip. */
  isResettingRef: RefObject<boolean>;
}

export interface AssignedDraftNotifyListSync {
  /**
   * Call immediately after `methods.reset(settings)` so preference state and `prevShowDrafts` ref
   * match storage. Also normalizes invalid legacy rows (`notifyOnDrafts` + hidden list).
   */
  onHydrateFromStorage: (next: ExtensionSettings) => void;
  /** Parent reads this in the debounced autosave: skip the header "saved" flash for silent clears. */
  suppressSavedFlashRef: RefObject<boolean>;
  showDraftsInList: boolean;
  /**
   * In-memory only — never written to `chrome.storage` or any other persistence. Only
   * `assigned.notifyOnDrafts` is saved.
   *
   * While the list is hidden: `true` only after the user turns **Notify on drafts** on (checkbox +
   * warning styling). `false` after hiding the list with notify on (silent paired-off) until they
   * opt in again. Re-showing the list restores notify only if they opted in while hidden (ref), not
   * this flag alone.
   */
  draftNotifyPreferred: boolean;
  setDraftNotifyPreferred: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Keeps **stored** `assigned.notifyOnDrafts` consistent with the invalid-configuration rules while
 * still letting the user express intent when drafts are hidden from the list.
 *
 * ### Why two layers?
 * - **Form value** (`notifyOnDrafts`): what we persist. Must stay `false` while `showDraftsInList`
 *   is false, or the worker would re-fire draft notifications forever (drafts are not persisted
 *   when hidden — see `PRService` + `effectiveAssignedNotifyOnDrafts`).
 * - **UI preference** (`draftNotifyPreferred`): React state only — **not stored** in `chrome.storage`.
 *   While the list is hidden it is `true` only if the user turns **Notify on drafts** on (then we show
 *   warning styling + callout). Hiding the list while notify was on clears stored notify and resets
 *   this to `false` (both look off, no warning). Showing the list again does **not** turn notify
 *   back on unless the user turned **Notify on drafts** on while the list was hidden (internal
 *   ref). While the list is visible, preference mirrors the stored field.
 *
 * ### Hydration
 * `onHydrateFromStorage` runs after each `reset(settings)`. While the list is hidden, storage always
 * has `notifyOnDrafts: false`, so we must **not** copy that into `draftNotifyPreferred` — doing so
 * would wipe intent after every autosave. Only sync preference from `notify` when drafts are shown;
 * fix legacy invalid `(notify && !show)` explicitly (clear stored notify, keep restore ref, no warning pref).
 *
 * ### Saved indicator
 * `suppressSavedFlashRef` is only used when **hydration** fixes invalid legacy storage (`notify` while
 * list hidden) — that is invisible repair, not a deliberate toggle. When the user turns off
 * "Show drafts in list", we still clear stored `notifyOnDrafts` in the same tick but we **do** let
 * the normal save flash run so the header reflects their action.
 */
export const useAssignedDraftNotifyListSync = ({
  methods,
  settings,
  isLoading,
  isResettingRef,
}: UseAssignedDraftNotifyListSyncParams): AssignedDraftNotifyListSync => {
  const suppressSavedFlashRef = useRef(false);
  const prevShowDraftsInListRef = useRef<boolean | null>(null);
  /** In-memory: what `notifyOnDrafts` should become when the user shows the list again (not persisted). */
  const notifyRestoreWhenListVisibleRef = useRef(false);
  const showDraftsInListRef = useRef(false);

  const [draftNotifyPreferred, setDraftNotifyPreferredInner] = useState(false);

  const showDraftsInList = methods.watch('assigned.showDraftsInList');
  const notifyOnDrafts = methods.watch('assigned.notifyOnDrafts');

  showDraftsInListRef.current = showDraftsInList;

  const setDraftNotifyPreferred = useCallback((value: React.SetStateAction<boolean>) => {
    setDraftNotifyPreferredInner((prev) => {
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value;
      if (!showDraftsInListRef.current) {
        notifyRestoreWhenListVisibleRef.current = next;
      }
      return next;
    });
  }, []);

  const onHydrateFromStorage = useCallback(
    (next: ExtensionSettings) => {
      const show = next.assigned.showDraftsInList;
      const notify = next.assigned.notifyOnDrafts;
      if (!show && notify) {
        suppressSavedFlashRef.current = true;
        methods.setValue('assigned.notifyOnDrafts', false, { shouldDirty: true });
        notifyRestoreWhenListVisibleRef.current = true;
        setDraftNotifyPreferredInner(false);
      } else if (show) {
        notifyRestoreWhenListVisibleRef.current = notify;
        setDraftNotifyPreferredInner(notify);
      }
      // !show && !notify: keep in-memory preference + restore ref — storage cannot encode session intent
      prevShowDraftsInListRef.current = show;
    },
    [methods]
  );

  /**
   * List show/hide transitions must run **before** the mirror effect below: when the list becomes
   * visible, `notifyOnDrafts` is still false for one frame; mirroring would zero
   * `notifyRestoreWhenListVisibleRef` before we read it to restore.
   *
   * **useLayoutEffect** (not `useEffect`): when hiding the list, `draftNotifyPreferred` is still
   * `true` for one commit until we clear it; a passive effect runs after paint and caused a visible
   * flash of warning toggle + callout.
   */
  useLayoutEffect(() => {
    if (isLoading || !settings || isResettingRef.current) return;

    const prev = prevShowDraftsInListRef.current;
    prevShowDraftsInListRef.current = showDraftsInList;

    if (prev === null || prev === showDraftsInList) return;

    if (prev && !showDraftsInList) {
      // Do not auto-restore notify when the list is shown again after this silent hide; only
      // `setDraftNotifyPreferred(true)` while hidden sets the ref to true.
      notifyRestoreWhenListVisibleRef.current = false;
      setDraftNotifyPreferredInner(false);
      methods.setValue('assigned.notifyOnDrafts', false, { shouldDirty: true });
      return;
    }

    if (!prev && showDraftsInList) {
      const restore = notifyRestoreWhenListVisibleRef.current;
      methods.setValue('assigned.notifyOnDrafts', restore, { shouldDirty: true });
      setDraftNotifyPreferredInner(restore);
    }
  }, [showDraftsInList, isLoading, settings, methods]);

  /** While drafts are shown, mirror the stored toggle into preference and keep restore ref aligned. */
  useEffect(() => {
    if (isLoading || !settings || isResettingRef.current || !showDraftsInList) return;
    setDraftNotifyPreferredInner(notifyOnDrafts);
    notifyRestoreWhenListVisibleRef.current = notifyOnDrafts;
  }, [showDraftsInList, notifyOnDrafts, isLoading, settings]);

  return {
    onHydrateFromStorage,
    suppressSavedFlashRef,
    showDraftsInList,
    draftNotifyPreferred,
    setDraftNotifyPreferred,
  };
};

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { ExtensionSettings } from './types';

export interface UseAssignedDraftNotifyListSyncParams {
  methods: UseFormReturn<ExtensionSettings>;
  /** Latest snapshot from `chrome.storage` (null while loading). */
  settings: ExtensionSettings | null | undefined;
  isLoading: boolean;
  /** Shared with the rest of settings: true while `reset(settings)` runs so autosave / transitions skip. */
  isResettingRef: MutableRefObject<boolean>;
}

export interface AssignedDraftNotifyListSync {
  /**
   * Call immediately after `methods.reset(settings)` so preference state and `prevShowDrafts` ref
   * match storage. Also normalizes invalid legacy rows (`notifyOnDrafts` + hidden list).
   */
  onHydrateFromStorage: (next: ExtensionSettings) => void;
  /** Parent reads this in the debounced autosave: skip the header "saved" flash for silent clears. */
  suppressSavedFlashRef: MutableRefObject<boolean>;
  showDraftsInList: boolean;
  /**
   * In-memory only — never written to `chrome.storage` or any other persistence. Only
   * `assigned.notifyOnDrafts` is saved; this tracks UI intent while the list is hidden.
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
 * - **UI preference** (`draftNotifyPreferred`): React state only — **not stored** in `chrome.storage`
 *   or elsewhere. While the list is hidden we still persist `notifyOnDrafts: false` immediately
 *   (worker safety), but the checkbox **stays visually on** if they had it on before — warning color +
 *   preference — until they turn it off. While the list is visible, preference tracks the real field
 *   so there is no stale state on the frame we hide the list.
 *
 * ### Hydration
 * `onHydrateFromStorage` runs after each `reset(settings)`. While the list is hidden, storage always
 * has `notifyOnDrafts: false`, so we must **not** copy that into `draftNotifyPreferred` — doing so
 * would wipe intent after every autosave. Only sync preference from `notify` when drafts are shown;
 * fix legacy invalid `(notify && !show)` explicitly.
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
  const [draftNotifyPreferred, setDraftNotifyPreferred] = useState(false);
  const draftNotifyPreferredRef = useRef(draftNotifyPreferred);
  draftNotifyPreferredRef.current = draftNotifyPreferred;

  const showDraftsInList = methods.watch('assigned.showDraftsInList');
  const notifyOnDrafts = methods.watch('assigned.notifyOnDrafts');

  /** While drafts are shown, mirror the stored toggle into preference so hiding the list never reads stale `false`. */
  useEffect(() => {
    if (isLoading || !settings || isResettingRef.current || !showDraftsInList) return;
    setDraftNotifyPreferred(notifyOnDrafts);
  }, [showDraftsInList, notifyOnDrafts, isLoading, settings]);

  const onHydrateFromStorage = useCallback(
    (next: ExtensionSettings) => {
      const show = next.assigned.showDraftsInList;
      const notify = next.assigned.notifyOnDrafts;
      if (!show && notify) {
        suppressSavedFlashRef.current = true;
        methods.setValue('assigned.notifyOnDrafts', false, { shouldDirty: true });
        setDraftNotifyPreferred(true);
      } else if (show) {
        setDraftNotifyPreferred(notify);
      }
      // !show && !notify: keep in-memory preference — storage cannot encode "want notify when list returns"
      prevShowDraftsInListRef.current = show;
    },
    [methods],
  );

  useEffect(() => {
    if (isLoading || !settings || isResettingRef.current) return;

    const prev = prevShowDraftsInListRef.current;
    prevShowDraftsInListRef.current = showDraftsInList;

    if (prev === null || prev === showDraftsInList) return;

    if (prev && !showDraftsInList) {
      setDraftNotifyPreferred(methods.getValues('assigned.notifyOnDrafts'));
      methods.setValue('assigned.notifyOnDrafts', false, { shouldDirty: true });
      return;
    }

    if (!prev && showDraftsInList) {
      methods.setValue('assigned.notifyOnDrafts', draftNotifyPreferredRef.current, {
        shouldDirty: true,
      });
    }
  }, [showDraftsInList, isLoading, settings, methods]);

  return {
    onHydrateFromStorage,
    suppressSavedFlashRef,
    showDraftsInList,
    draftNotifyPreferred,
    setDraftNotifyPreferred,
  };
};

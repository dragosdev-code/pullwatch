import { describe, expect, it } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useAssignedDraftNotifyListSync } from '../use-assigned-draft-notify-list-sync';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../types';

/**
 * `sync.draftNotifyPreferred` is **React state in the hook only** — it is never written to
 * `chrome.storage` (sync or local) and does not exist on {@link ExtensionSettings}.
 *
 * What *would* be persisted is the form field `assigned.notifyOnDrafts` (and the rest of
 * settings). Here, `renderSync(settings)` / `withAssigned` only model that storage snapshot on the form.
 *
 * **No real `chrome.storage` (or `StorageService` / debounced `saveSettings`)** runs in this file;
 * persistence is untested here — only hook behavior given load-shaped form state.
 *
 * Hiding the list with notify on clears `draftNotifyPreferred` (no warning UX). Re-showing the list
 * does not turn notify on again unless the user enabled notify while the list was hidden.
 */
const clone = (s: ExtensionSettings): ExtensionSettings => structuredClone(s);

const withAssigned = (patch: Partial<ExtensionSettings['assigned']>): ExtensionSettings => {
  const s = clone(DEFAULT_SETTINGS);
  s.assigned = { ...s.assigned, ...patch };
  return s;
};

type SyncHostProps = {
  /** `null` simulates settings still loading (`isLoading: true`). */
  settings: ExtensionSettings | null;
  children: (api: {
    methods: UseFormReturn<ExtensionSettings>;
    sync: ReturnType<typeof useAssignedDraftNotifyListSync>;
  }) => ReactNode;
};

/**
 * Mirrors settings-page wiring: reset + hydrate when `settings` is non-null, same refs as production.
 * `settings` stands in for a loaded storage snapshot; `draftNotifyPreferred` is still hook-local only.
 */
const SyncHost = ({ settings, children }: SyncHostProps) => {
  const methods = useForm<ExtensionSettings>({ defaultValues: clone(DEFAULT_SETTINGS) });
  const isResettingRef = useRef(false);
  const isLoading = settings === null;
  const sync = useAssignedDraftNotifyListSync({
    methods,
    settings,
    isLoading,
    isResettingRef,
  });

  useEffect(() => {
    if (settings) {
      isResettingRef.current = true;
      methods.reset(settings);
      sync.onHydrateFromStorage(settings);
      isResettingRef.current = false;
    }
  }, [settings, methods, sync.onHydrateFromStorage]);

  return <>{children({ methods, sync })}</>;
};

const renderSync = (settings: ExtensionSettings | null) => {
  const api = {} as {
    methods: UseFormReturn<ExtensionSettings>;
    sync: ReturnType<typeof useAssignedDraftNotifyListSync>;
  };

  const utils = render(
    <SyncHost settings={settings}>
      {({ methods, sync }) => {
        Object.assign(api, { methods, sync });
        return null;
      }}
    </SyncHost>,
  );

  return { ...utils, api };
};

describe('useAssignedDraftNotifyListSync', () => {
  describe('onHydrateFromStorage (via SyncHost)', () => {
    it('when list visible: copies notifyOnDrafts into draftNotifyPreferred', () => {
      const settings = withAssigned({ showDraftsInList: true, notifyOnDrafts: true });
      const { api } = renderSync(settings);

      expect(api.sync.draftNotifyPreferred).toBe(true);
      expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(true);
      expect(api.sync.suppressSavedFlashRef.current).toBe(false);
    });

    it('legacy invalid (notify on, list hidden): forces stored notify false, no warning pref, suppress flash; showing list restores notify', async () => {
      const invalid = withAssigned({ showDraftsInList: false, notifyOnDrafts: true });
      const { api } = renderSync(invalid);

      expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false);
      expect(api.sync.draftNotifyPreferred).toBe(false);
      expect(api.sync.suppressSavedFlashRef.current).toBe(true);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', true, { shouldDirty: true });
      });

      await waitFor(() => {
        expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(true);
      });
      expect(api.sync.draftNotifyPreferred).toBe(true);
    });

    it('list hidden and notify false: second hydrate does not clear preference (simulated storage echo)', () => {
      const hidden = withAssigned({ showDraftsInList: false, notifyOnDrafts: false });
      const { api } = renderSync(hidden);

      act(() => {
        api.sync.setDraftNotifyPreferred(true);
      });

      act(() => {
        const again = clone(hidden);
        api.methods.reset(again);
        api.sync.onHydrateFromStorage(again);
      });

      expect(api.sync.draftNotifyPreferred).toBe(true);
      expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false);
    });
  });

  describe('transition: show drafts in list', () => {
    it('hiding list while notify on: persists notify false, clears warning pref (silent paired-off)', async () => {
      const visible = withAssigned({ showDraftsInList: true, notifyOnDrafts: true });
      const { api } = renderSync(visible);

      expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(true);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', false, { shouldDirty: true });
      });

      await waitFor(() => {
        expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false);
      });

      expect(api.sync.draftNotifyPreferred).toBe(false);
      expect(api.sync.showDraftsInList).toBe(false);
    });

    it('after silent hide, turning notify on while list hidden sets warning preference; showing list persists notify', async () => {
      const visible = withAssigned({ showDraftsInList: true, notifyOnDrafts: true });
      const { api } = renderSync(visible);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', false, { shouldDirty: true });
      });
      await waitFor(() => expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false));
      expect(api.sync.draftNotifyPreferred).toBe(false);

      act(() => {
        api.sync.setDraftNotifyPreferred(true);
      });
      expect(api.sync.draftNotifyPreferred).toBe(true);
      expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', true, { shouldDirty: true });
      });
      await waitFor(() => {
        expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(true);
      });
      expect(api.sync.draftNotifyPreferred).toBe(true);
    });

    it('showing list again after silent hide keeps notify off', async () => {
      const visible = withAssigned({ showDraftsInList: true, notifyOnDrafts: true });
      const { api } = renderSync(visible);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', false, { shouldDirty: true });
      });

      await waitFor(() => expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false));
      expect(api.sync.draftNotifyPreferred).toBe(false);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', true, { shouldDirty: true });
      });

      await waitFor(() => {
        expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false);
      });
      expect(api.sync.draftNotifyPreferred).toBe(false);
    });

    it('showing list with preference false keeps notify off', async () => {
      const start = withAssigned({ showDraftsInList: true, notifyOnDrafts: false });
      const { api } = renderSync(start);

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', false, { shouldDirty: true });
      });

      await waitFor(() => expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false));

      act(() => {
        api.methods.setValue('assigned.showDraftsInList', true, { shouldDirty: true });
      });

      await waitFor(() => {
        expect(api.methods.getValues('assigned.notifyOnDrafts')).toBe(false);
      });
    });
  });

  describe('sync while list visible', () => {
    it('mirrors notifyOnDrafts into draftNotifyPreferred when toggling notify', async () => {
      const visible = withAssigned({ showDraftsInList: true, notifyOnDrafts: false });
      const { api } = renderSync(visible);

      expect(api.sync.draftNotifyPreferred).toBe(false);

      act(() => {
        api.methods.setValue('assigned.notifyOnDrafts', true, { shouldDirty: true });
      });

      await waitFor(() => {
        expect(api.sync.draftNotifyPreferred).toBe(true);
      });

      act(() => {
        api.methods.setValue('assigned.notifyOnDrafts', false, { shouldDirty: true });
      });

      await waitFor(() => {
        expect(api.sync.draftNotifyPreferred).toBe(false);
      });
    });
  });
});

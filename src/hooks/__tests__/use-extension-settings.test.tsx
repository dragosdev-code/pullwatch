import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import type { ExtensionSettings } from '@common/types';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';
import { useExtensionSettings } from '../use-extension-settings';

function cloneSettings(): ExtensionSettings {
  return JSON.parse(JSON.stringify(DEFAULT_EXTENSION_SETTINGS)) as ExtensionSettings;
}

const settingsMocks = vi.hoisted(() => {
  let onSettingsChange: ((s: ExtensionSettings) => void) | undefined;
  return {
    get: vi.fn(),
    save: vi.fn(),
    onChange: vi.fn((cb: (s: ExtensionSettings) => void) => {
      onSettingsChange = cb;
      return () => {
        onSettingsChange = undefined;
      };
    }),
    emitRemote(settings: ExtensionSettings) {
      onSettingsChange?.(settings);
    },
  };
});

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    settings: {
      get: () => settingsMocks.get(),
      save: (...args: unknown[]) =>
        settingsMocks.save(...(args as [Partial<ExtensionSettings>])),
      onChange: (cb: (s: ExtensionSettings) => void) => settingsMocks.onChange(cb),
    },
  },
}));

describe('Settings kept in sync with the background', () => {
  beforeEach(() => {
    settingsMocks.get.mockReset();
    settingsMocks.save.mockReset();
    settingsMocks.onChange.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reflects toggles written by the service worker when storage changes arrive', async () => {
    const initial = cloneSettings();
    settingsMocks.get.mockResolvedValue(initial);

    const { result } = renderHook(() => useExtensionSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings?.assigned.notificationsEnabled).toBe(true);

    const remote = cloneSettings();
    remote.assigned.notificationsEnabled = false;

    act(() => {
      settingsMocks.emitRemote(remote);
    });

    expect(result.current.settings?.assigned.notificationsEnabled).toBe(false);
  });

  it('persists a user change and surfaces it on the next open', async () => {
    const initial = cloneSettings();
    const afterSave = cloneSettings();
    afterSave.assigned.notifyOnDrafts = true;

    settingsMocks.get.mockResolvedValueOnce(initial).mockResolvedValueOnce(afterSave);
    settingsMocks.save.mockResolvedValue(afterSave);

    const { result, unmount } = renderHook(() => useExtensionSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.saveSettings({
        assigned: { ...initial.assigned, notifyOnDrafts: true },
      });
    });

    expect(settingsMocks.save).toHaveBeenCalledTimes(1);
    expect(settingsMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned: expect.objectContaining({ notifyOnDrafts: true }),
      }),
    );
    expect(result.current.settings?.assigned.notifyOnDrafts).toBe(true);

    unmount();

    const { result: nextOpen } = renderHook(() => useExtensionSettings());

    await waitFor(() => {
      expect(nextOpen.current.isLoading).toBe(false);
    });

    expect(nextOpen.current.settings?.assigned.notifyOnDrafts).toBe(true);
  });
});

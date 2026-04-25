/**
 * WHY [fake BackgroundActionClient]: `save` / `testNotification` are pure RPC forwards; asserting
 * `dispatch` proves the client contract without `chrome.runtime` or sync storage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SETTINGS_ACTION } from '../../../runtime-actions';
import type { ExtensionSettings } from '../../../types';
import { SettingsClient } from '../settings-client';

describe('SettingsClient RPC methods', () => {
  const dispatch = vi.fn();
  const storage = {
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn(), getBytesInUse: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    session: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  };

  beforeEach(() => {
    dispatch.mockReset();
  });

  it('save forwards SETTINGS_ACTION.saveSettings with partial settings', async () => {
    const saved: ExtensionSettings = {} as ExtensionSettings;
    dispatch.mockResolvedValue(saved);
    const client = new SettingsClient(storage as never, { dispatch } as never);

    const patch = { theme: 'dark' } as Partial<ExtensionSettings>;
    await expect(client.save(patch)).resolves.toBe(saved);

    expect(dispatch).toHaveBeenCalledWith(SETTINGS_ACTION.saveSettings, patch);
  });

  it('testNotification forwards SETTINGS_ACTION.testSettingsNotification with category', async () => {
    dispatch.mockResolvedValue(undefined);
    const client = new SettingsClient(storage as never, { dispatch } as never);

    await client.testNotification('merged');

    expect(dispatch).toHaveBeenCalledWith(SETTINGS_ACTION.testSettingsNotification, {
      category: 'merged',
    });
  });
});

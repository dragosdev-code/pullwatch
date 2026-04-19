import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTENSION_SETTINGS,
  ensureCompleteSettings,
} from '../extension-settings-defaults';

describe('ensureCompleteSettings', () => {
  it('fills missing categories from defaults when storage is empty', () => {
    expect(ensureCompleteSettings(null)).toEqual(DEFAULT_EXTENSION_SETTINGS);
  });

  it('deep-merges each category over defaults', () => {
    // `Partial<ExtensionSettings>` is shallow: nested `assigned` is still `AssignedSettings`, not
    // `Partial<AssignedSettings>`. Assert the runtime shape we actually merge (see `saveSettings` patches).
    const merged = ensureCompleteSettings({
      assigned: { sound: 'bell' },
    } as Parameters<typeof ensureCompleteSettings>[0]);

    expect(merged.assigned.sound).toBe('bell');
    expect(merged.assigned.notificationsEnabled).toBe(
      DEFAULT_EXTENSION_SETTINGS.assigned.notificationsEnabled
    );
    expect(merged.merged).toEqual(DEFAULT_EXTENSION_SETTINGS.merged);
  });
});

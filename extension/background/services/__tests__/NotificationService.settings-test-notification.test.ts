import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { NotificationService } from '../NotificationService';
import type { ExtensionSettings, PullRequest } from '../../../common/types';
import { DEFAULT_EXTENSION_SETTINGS } from '../StorageService';
import {
  SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS,
  SETTINGS_PREVIEW_AFTER_CLEAR_MS,
  SETTINGS_TEST_ERROR_CHROME_DENIED,
} from '../../../common/constants';
import { SETTINGS_TEST_NOTIFICATION_COPY } from '../../../common/settings-test-notification-copy';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const openPr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  id: 'o1',
  url: 'https://github.com/o/r/pull/2',
  title: 'Open PR',
  number: 2,
  repoName: 'o/r',
  author: [{ login: 'b' }],
  type: 'open',
  ...overrides,
});

describe('NotificationService.fireSettingsTestNotification (macOS preview ids)', () => {
  const debugLog = vi.fn();
  const debugError = vi.fn();
  const debugWarn = vi.fn();
  const playSound = vi.fn().mockResolvedValue(undefined);
  let getSettings: Mock<() => Promise<ExtensionSettings>>;
  let notificationsClear: ReturnType<typeof vi.fn>;
  let notificationsCreate: ReturnType<typeof vi.fn>;
  let notificationsGetAll: ReturnType<typeof vi.fn>;
  let getPermissionLevel: ReturnType<typeof vi.fn>;

  function settingsWithPreviewEnabled(patch: Partial<ExtensionSettings> = {}): ExtensionSettings {
    return {
      ...DEFAULT_EXTENSION_SETTINGS,
      assigned: { ...DEFAULT_EXTENSION_SETTINGS.assigned, notificationsEnabled: true },
      merged: { ...DEFAULT_EXTENSION_SETTINGS.merged, notificationsEnabled: true },
      ...patch,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: 10_000 });
    getSettings = vi.fn();
    notificationsClear = vi.fn().mockResolvedValue(true);
    notificationsCreate = vi.fn().mockImplementation((_id: string) => Promise.resolve(_id));
    notificationsGetAll = vi.fn().mockResolvedValue({});
    getPermissionLevel = vi.fn().mockResolvedValue('granted');

    globalThis.chrome = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      notifications: {
        clear: notificationsClear,
        create: notificationsCreate,
        getAll: notificationsGetAll,
        getPermissionLevel,
      },
    } as unknown as typeof chrome;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'chrome');
  });

  function makeService(settings: ExtensionSettings) {
    getSettings.mockResolvedValue(settings);
    return new NotificationService({
      debugService: {
        log: debugLog,
        error: debugError,
        warn: debugWarn,
      } as never,
      storageService: {
        getExtensionSettings: getSettings,
      } as never,
      soundService: {
        playNotificationSound: playSound,
      } as never,
    });
  }

  it('creates a timestamp-suffixed id on first preview', async () => {
    const svc = makeService(settingsWithPreviewEnabled());
    await svc.fireSettingsTestNotification('assigned');

    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    const id = notificationsCreate.mock.calls[0][0] as string;
    expect(id).toMatch(/^extension-settings-test\|assigned\|\d+$/);
    expect(id.endsWith('|10000')).toBe(true);

    const options = notificationsCreate.mock.calls[0][1] as chrome.notifications.NotificationCreateOptions;
    expect(options.title).toBe(SETTINGS_TEST_NOTIFICATION_COPY.assigned.title);
    expect(options.message).toMatch(
      new RegExp(
        `^${escapeRegExp(SETTINGS_TEST_NOTIFICATION_COPY.assigned.message)}\n\nPreview · .+`
      )
    );
    expect(options.contextMessage).toMatch(
      new RegExp(`^${escapeRegExp(SETTINGS_TEST_NOTIFICATION_COPY.assigned.contextMessage)} · .+`)
    );
    expect(notificationsGetAll).toHaveBeenCalledTimes(1);
  });

  it('appends Preview time to contextMessage for merged preview', async () => {
    const svc = makeService(settingsWithPreviewEnabled());
    await svc.fireSettingsTestNotification('merged');

    const options = notificationsCreate.mock.calls[0][1] as chrome.notifications.NotificationCreateOptions;
    expect(options.message).toMatch(
      new RegExp(
        `^${escapeRegExp(SETTINGS_TEST_NOTIFICATION_COPY.merged.message)}\n\nPreview · .+`
      )
    );
    expect(options.contextMessage).toMatch(
      new RegExp(`^${escapeRegExp(SETTINGS_TEST_NOTIFICATION_COPY.merged.contextMessage)} · .+`)
    );
  });

  it('clears the previous preview id before creating a new one on the next fire', async () => {
    const svc = makeService(settingsWithPreviewEnabled());

    await svc.fireSettingsTestNotification('assigned');
    const firstId = notificationsCreate.mock.calls[0][0] as string;
    vi.clearAllMocks();
    notificationsClear.mockResolvedValue(true);
    notificationsCreate.mockImplementation((id: string) => Promise.resolve(id));

    vi.setSystemTime(10_000 + SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS + 1);

    notificationsGetAll.mockResolvedValue({});
    const secondFire = svc.fireSettingsTestNotification('assigned');
    await vi.advanceTimersByTimeAsync(SETTINGS_PREVIEW_AFTER_CLEAR_MS);
    await secondFire;

    expect(notificationsClear.mock.calls.map((c) => c[0])).toContain(firstId);

    const clearBeforeCreateIndex = notificationsClear.mock.calls.findIndex((c) => c[0] === firstId);
    expect(clearBeforeCreateIndex).toBeGreaterThanOrEqual(0);

    const secondId = notificationsCreate.mock.calls[notificationsCreate.mock.calls.length - 1][0] as string;
    expect(secondId).not.toBe(firstId);
    expect(secondId).toMatch(/^extension-settings-test\|assigned\|\d+$/);
  });

  it('regression: assigned PR notifications still use pr-alert ids', async () => {
    const svc = makeService(
      settingsWithPreviewEnabled({
        assigned: {
          ...DEFAULT_EXTENSION_SETTINGS.assigned,
          notificationsEnabled: true,
          notifyOnDrafts: false,
          showDraftsInList: true,
        },
      })
    );

    const pr = openPr();
    await svc.showAssignedPRNotifications(pr);

    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    const id = notificationsCreate.mock.calls[0][0] as string;
    expect(id).toBe(`pr-alert|assigned|${pr.url}`);
  });

  it('throws CHROME_DENIED and never calls create when getPermissionLevel returns denied', async () => {
    getPermissionLevel.mockResolvedValue('denied');
    const svc = makeService(settingsWithPreviewEnabled());

    await expect(svc.fireSettingsTestNotification('assigned')).rejects.toThrow(
      SETTINGS_TEST_ERROR_CHROME_DENIED
    );

    expect(notificationsCreate).not.toHaveBeenCalled();
    expect(playSound).not.toHaveBeenCalled();
    expect(getSettings).not.toHaveBeenCalled();
  });

  it('proceeds normally when getPermissionLevel returns granted', async () => {
    getPermissionLevel.mockResolvedValue('granted');
    const svc = makeService(settingsWithPreviewEnabled());

    await svc.fireSettingsTestNotification('assigned');

    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    expect(getPermissionLevel).toHaveBeenCalledTimes(1);
  });
});

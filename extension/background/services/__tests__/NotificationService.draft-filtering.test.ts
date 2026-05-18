import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { NotificationService } from '../NotificationService';
import type { ExtensionSettings, PullRequest } from '@common/types';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';

function baseSettings(assignedPatch: Partial<ExtensionSettings['assigned']>): ExtensionSettings {
  return {
    ...DEFAULT_EXTENSION_SETTINGS,
    assigned: { ...DEFAULT_EXTENSION_SETTINGS.assigned, ...assignedPatch },
  };
}

const draftPr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  id: 'd1',
  url: 'https://github.com/o/r/pull/1',
  title: 'Draft PR',
  number: 1,
  repoName: 'o/r',
  author: [{ login: 'a' }],
  type: 'draft',
  ...overrides,
});

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

describe('NotificationService.showAssignedPRNotifications (draft filtering)', () => {
  const debugLog = vi.fn();
  const debugError = vi.fn();
  const debugWarn = vi.fn();
  const playSound = vi.fn().mockResolvedValue(undefined);
  let getSettings: Mock<() => Promise<ExtensionSettings>>;

  let notificationsCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSettings = vi.fn();
    notificationsCreate = vi.fn().mockResolvedValue('notification-id');

    globalThis.chrome = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      notifications: {
        clear: vi.fn().mockResolvedValue(true),
        create: notificationsCreate,
      },
    } as unknown as (typeof globalThis)['chrome'];

    vi.clearAllMocks();
  });

  afterEach(() => {
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

  it('returns early when assigned notifications are disabled (no draft filtering path)', async () => {
    const svc = makeService(
      baseSettings({
        notificationsEnabled: false,
        notifyOnDrafts: true,
        showDraftsInList: true,
      })
    );
    await svc.showAssignedPRNotifications(draftPr());
    expect(notificationsCreate).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith(
      '[NotificationService] Assigned PR notifications disabled, skipping'
    );
  });

  it('includes draft PRs when notifyOnDrafts and showDraftsInList are both true', async () => {
    const svc = makeService(
      baseSettings({
        notificationsEnabled: true,
        notifyOnDrafts: true,
        showDraftsInList: true,
      })
    );
    const pr = draftPr();
    await svc.showAssignedPRNotifications(pr);
    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    const [, opts] = notificationsCreate.mock.calls[0]!;
    expect(opts.message).toBe(pr.title);
  });

  it('filters drafts when notifyOnDrafts is false (sound still plays for remaining PRs)', async () => {
    const svc = makeService(
      baseSettings({
        notificationsEnabled: true,
        notifyOnDrafts: false,
        showDraftsInList: true,
      })
    );
    await svc.showAssignedPRNotifications([draftPr(), openPr()]);
    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining(
        '[NotificationService] Skipped 1 draft PR(s) (notifyOnDrafts=false):'
      ),
      expect.any(Array)
    );
    expect(playSound).toHaveBeenCalled();
  });

  it('filters drafts for invalid combo: notify on with list hidden (logs invalid-settings reason)', async () => {
    const svc = makeService(
      baseSettings({
        notificationsEnabled: true,
        notifyOnDrafts: true,
        showDraftsInList: false,
      })
    );
    await svc.showAssignedPRNotifications(draftPr());
    expect(notificationsCreate).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'invalid settings: notifyOnDrafts with showDraftsInList off would cause duplicate notifications'
      ),
      expect.any(Array)
    );
    expect(debugLog).toHaveBeenCalledWith(
      '[NotificationService] All new PRs are drafts and draft notifications are off (or invalid draft settings), skipping notifications'
    );
    expect(playSound).not.toHaveBeenCalled();
  });

  it('still notifies non-draft PRs when invalid combo but array mixes draft and open', async () => {
    const svc = makeService(
      baseSettings({
        notificationsEnabled: true,
        notifyOnDrafts: true,
        showDraftsInList: false,
      })
    );
    const open = openPr();
    await svc.showAssignedPRNotifications([draftPr(), open]);
    expect(notificationsCreate).toHaveBeenCalledTimes(1);
    const [, opts] = notificationsCreate.mock.calls[0]!;
    expect(opts.message).toBe(open.title);
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining('invalid settings'),
      expect.any(Array)
    );
    expect(playSound).toHaveBeenCalled();
  });

  it('does not log skip line when there are no drafts', async () => {
    const svc = makeService(
      baseSettings({
        notificationsEnabled: true,
        notifyOnDrafts: false,
        showDraftsInList: true,
      })
    );
    await svc.showAssignedPRNotifications(openPr());
    const skipLogs = debugLog.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('Skipped') && c[0].includes('draft')
    );
    expect(skipLogs).toHaveLength(0);
  });

  // WHY [direct return-value tests]: PRService.persistAndNotifyAssigned branches on the
  // `PrNotifyVisualResult.fired` flag to decide whether to call playAssignedSound. Asserting the
  // contract here catches regressions before they reach the integration tests in PRService.
  describe('createAssignedPRVisuals return value', () => {
    it('returns { fired: false, reason: "disabled" } when assigned notifications are off', async () => {
      const svc = makeService(
        baseSettings({
          notificationsEnabled: false,
          notifyOnDrafts: true,
          showDraftsInList: true,
        })
      );
      const result = await svc.createAssignedPRVisuals(openPr());
      expect(result).toEqual({ fired: false, reason: 'disabled' });
      expect(notificationsCreate).not.toHaveBeenCalled();
    });

    it('returns { fired: false, reason: "empty_input" } when newPRs is an empty array', async () => {
      const svc = makeService(
        baseSettings({ notificationsEnabled: true, notifyOnDrafts: true, showDraftsInList: true })
      );
      const result = await svc.createAssignedPRVisuals([]);
      expect(result).toEqual({ fired: false, reason: 'empty_input' });
      expect(notificationsCreate).not.toHaveBeenCalled();
    });

    it('returns { fired: false, reason: "all_drafts_filtered" } when every PR is a draft and drafts are off', async () => {
      const svc = makeService(
        baseSettings({
          notificationsEnabled: true,
          notifyOnDrafts: false,
          showDraftsInList: true,
        })
      );
      const result = await svc.createAssignedPRVisuals([
        draftPr({ id: 'd1' }),
        draftPr({ id: 'd2' }),
      ]);
      expect(result).toEqual({ fired: false, reason: 'all_drafts_filtered' });
      expect(notificationsCreate).not.toHaveBeenCalled();
    });

    it('returns { fired: true } and creates the banner when at least one PR survives filtering', async () => {
      const svc = makeService(
        baseSettings({
          notificationsEnabled: true,
          notifyOnDrafts: false,
          showDraftsInList: true,
        })
      );
      const result = await svc.createAssignedPRVisuals([draftPr(), openPr()]);
      expect(result).toEqual({ fired: true });
      expect(notificationsCreate).toHaveBeenCalledTimes(1);
      // The split path does not play sound: that is playAssignedSound's job, and the wrapper
      // (showAssignedPRNotifications) is what chains them.
      expect(playSound).not.toHaveBeenCalled();
    });
  });
});

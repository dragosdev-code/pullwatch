import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@common/utils', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

const storageGet = vi.fn();
const storageSet = vi.fn().mockResolvedValue(undefined);
const storageRemove = vi.fn().mockResolvedValue(undefined);

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: (...args: unknown[]) => storageGet(...args),
        set: (...args: unknown[]) => storageSet(...args),
        remove: (...args: unknown[]) => storageRemove(...args),
      },
    },
  },
}));

import { PRService } from '../PRService';
import type { PullRequest } from '@common/types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_PR_TOMBSTONES,
  TOMBSTONE_ALARM_WINDOW,
} from '@common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';
import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';

type StoredPRData = { prs: PullRequest[]; timestamp?: number };

const T0 = new Date('2026-04-27T12:00:00.000Z').getTime();

function makePR(partial: Partial<PullRequest> & Pick<PullRequest, 'id' | 'url'>): PullRequest {
  return {
    title: 't',
    number: 1,
    repoName: 'o/r',
    author: [{ login: 'u' }],
    type: 'open',
    reviewStatus: 'pending',
    ...partial,
  };
}

function snap(): GitHubStatusSnapshot {
  return { prComponentStatus: 'operational', globalIndicator: 'none', fetchedAt: T0 };
}

function makePRList(prefix: string, count: number): PullRequest[] {
  return Array.from({ length: count }, (_, i) =>
    makePR({ id: `${prefix}${i + 1}`, url: `https://github.com/o/r/pull/${prefix}${i + 1}` })
  );
}

function settingsWithDraftVisibility(showDraftsInList: boolean) {
  return {
    ...DEFAULT_EXTENSION_SETTINGS,
    assigned: {
      ...DEFAULT_EXTENSION_SETTINGS.assigned,
      showDraftsInList,
    },
  };
}

describe('PRService tombstone resurrection', () => {
  let getStoredPRs: Mock;
  let setStoredPRs: Mock;
  let getGitHubViewerIdentity: Mock;
  let getExtensionSettings: Mock;
  let setLastFetchTime: Mock;
  let fetchAssignedPRs: Mock;
  let fetchReviewedPRs: Mock;
  let fetchMergedPRs: Mock;
  let fetchAuthoredPRs: Mock;
  let getLastResolvedViewerLogin: Mock;
  let createAssignedPRVisuals: Mock;
  let createMergedPRVisuals: Mock;
  let playAssignedSound: Mock;
  let playMergedSound: Mock;
  let setPRCountBadge: Mock;
  let getStatus: Mock;
  let signalGitHubOutage: Mock;
  let clearGitHubOutage: Mock;
  let storedByKey: Record<string, StoredPRData | null>;
  let chromeStorageByKey: Record<string, unknown>;
  let alarmSeqValue: number;
  let storageGetGeneric: Mock;
  let storageSetGeneric: Mock;

  function makeService() {
    return new PRService({
      debugService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      storageService: {
        getStoredPRs,
        setStoredPRs,
        getGitHubViewerIdentity,
        getExtensionSettings,
        remove: vi.fn().mockResolvedValue(undefined),
        setLastFetchTime,
        get: storageGetGeneric,
        set: storageSetGeneric,
      } as never,
      gitHubService: {
        fetchAssignedPRs,
        fetchReviewedPRs,
        fetchMergedPRs,
        fetchAuthoredPRs,
        getLastResolvedViewerLogin,
      } as never,
      notificationService: {
        createAssignedPRVisuals,
        createMergedPRVisuals,
        playAssignedSound,
        playMergedSound,
        showAssignedPRNotifications: vi.fn(),
        showMergedPRNotifications: vi.fn(),
      } as never,
      badgeService: {
        setPRCountBadge,
        setErrorBadge: vi.fn(),
      } as never,
      rateLimitService: {
        recordSuccess: vi.fn(),
        recordRateLimitHit: vi.fn(),
      } as never,
      healthStatusService: {
        clearParserBreakage: vi.fn().mockResolvedValue(undefined),
        clearGitHubOutage,
        signalParserBreakage: vi.fn().mockResolvedValue(undefined),
        signalGitHubOutage,
      } as never,
      gitHubStatusClient: { getStatus } as never,
      alarmSeqClock: {
        current: vi.fn(async () => alarmSeqValue),
        advance: vi.fn(async () => ++alarmSeqValue),
      } as never,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.clearAllMocks();
    chromeStorageByKey = {};
    alarmSeqValue = 0;

    storageGet.mockReset().mockImplementation(async (key?: string | string[]) => {
      if (typeof key === 'string') return { [key]: chromeStorageByKey[key] };
      if (Array.isArray(key)) return Object.fromEntries(key.map((k) => [k, chromeStorageByKey[k]]));
      return { ...chromeStorageByKey };
    });
    storageSet.mockReset().mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(chromeStorageByKey, items);
    });
    storageRemove.mockReset().mockResolvedValue(undefined);

    storageGetGeneric = vi.fn(async (key: string) => chromeStorageByKey[key]);
    storageSetGeneric = vi.fn(async (key: string, value: unknown) => {
      chromeStorageByKey[key] = value;
    });

    storedByKey = {};
    getStoredPRs = vi.fn(async (key: string) => storedByKey[key] ?? null);
    setStoredPRs = vi.fn(async (key: string, prs: PullRequest[]) => {
      storedByKey[key] = { prs, timestamp: Date.now() };
    });
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'viewer' });
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);
    fetchAssignedPRs = vi.fn().mockResolvedValue([]);
    fetchReviewedPRs = vi.fn().mockResolvedValue([]);
    fetchMergedPRs = vi.fn().mockResolvedValue([]);
    fetchAuthoredPRs = vi.fn().mockResolvedValue([]);
    getLastResolvedViewerLogin = vi.fn().mockReturnValue('viewer');
    createAssignedPRVisuals = vi.fn().mockResolvedValue({ fired: true });
    createMergedPRVisuals = vi.fn().mockResolvedValue({ fired: true });
    playAssignedSound = vi.fn().mockResolvedValue(undefined);
    playMergedSound = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
    getStatus = vi.fn().mockResolvedValue(snap());
    signalGitHubOutage = vi.fn().mockResolvedValue(undefined);
    clearGitHubOutage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draft hidden by showDraftsInList is not tombstoned and does not signal churn when shown again', async () => {
    const open = makePR({ id: 'a1', url: 'https://github.com/o/r/pull/a1' });
    const draft = makePR({
      id: 'd1',
      url: 'https://github.com/o/r/pull/d1',
      type: 'draft',
    });
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: [open, draft] };
    fetchAssignedPRs.mockResolvedValue([open, draft]);

    alarmSeqValue = 1;
    getExtensionSettings.mockResolvedValue(settingsWithDraftVisibility(false));
    let pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    const tombstonesAfterHide = chromeStorageByKey[STORAGE_KEY_PR_TOMBSTONES] as
      | { byList?: { assigned?: Array<{ prKey: string; droppedAtAlarmSeq: number }> } }
      | undefined;
    expect(tombstonesAfterHide?.byList?.assigned?.some((t) => t.prKey === 'd1')).not.toBe(true);

    signalGitHubOutage.mockClear();
    alarmSeqValue = 2;
    getExtensionSettings.mockResolvedValue(settingsWithDraftVisibility(true));
    fetchAssignedPRs.mockResolvedValue([open, draft]);
    pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(signalGitHubOutage).not.toHaveBeenCalledWith(expect.anything(), 'pr_list_churn');
  });

  it('flap within window: vanish at wave N, return at wave N+1 → pr_list_churn signaled, no new-PR notification', async () => {
    // Wave N (alarmSeq=0): persist 5 assigned PRs to seed oldPRs.
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: makePRList('a', 5) };

    // Wave N+1 (alarmSeq=1): a3 vanishes from fresh.
    alarmSeqValue = 1;
    fetchAssignedPRs.mockResolvedValue([
      makePR({ id: 'a1', url: 'https://github.com/o/r/pull/a1' }),
      makePR({ id: 'a2', url: 'https://github.com/o/r/pull/a2' }),
      makePR({ id: 'a4', url: 'https://github.com/o/r/pull/a4' }),
      makePR({ id: 'a5', url: 'https://github.com/o/r/pull/a5' }),
    ]);
    let pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    // Tombstone for a3 should now exist at seq=1.
    const tombstones1 = chromeStorageByKey[STORAGE_KEY_PR_TOMBSTONES] as
      | { byList?: { assigned?: Array<{ prKey: string; droppedAtAlarmSeq: number }> } }
      | undefined;
    expect(tombstones1?.byList?.assigned?.some((t) => t.prKey === 'a3')).toBe(true);

    // Wave N+2 (alarmSeq=2): a3 returns. Seed storage with current persisted state (without a3).
    createAssignedPRVisuals.mockClear();
    signalGitHubOutage.mockClear();
    alarmSeqValue = 2;
    fetchAssignedPRs.mockResolvedValue(makePRList('a', 5)); // a1..a5 again
    pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    // a3 was absent in stored, returned in fresh → comparePRs would tag isNew. Tombstone filter
    // strips that flag and suppresses the notification. pr_list_churn is signaled.
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('List integrity'),
      'pr_list_churn'
    );
    if (createAssignedPRVisuals.mock.calls.length > 0) {
      const notifiedKeys = createAssignedPRVisuals.mock.calls[0][0].map((p: PullRequest) => p.id);
      expect(notifiedKeys).not.toContain('a3');
    }
  });

  it('expired tombstone: same key returns after the window closes → no resurrection signal', async () => {
    // Seed a tombstone for a3 at seq 0.
    chromeStorageByKey[STORAGE_KEY_PR_TOMBSTONES] = {
      byList: {
        assigned: [{ prKey: 'a3', droppedAtAlarmSeq: 0 }],
      },
    };
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
      prs: [
        makePR({ id: 'a1', url: 'https://github.com/o/r/pull/a1' }),
        makePR({ id: 'a2', url: 'https://github.com/o/r/pull/a2' }),
        makePR({ id: 'a4', url: 'https://github.com/o/r/pull/a4' }),
        makePR({ id: 'a5', url: 'https://github.com/o/r/pull/a5' }),
      ],
    };
    alarmSeqValue = TOMBSTONE_ALARM_WINDOW + 1; // delta == 5 > 4 → expired.
    fetchAssignedPRs.mockResolvedValue(makePRList('a', 5));

    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(signalGitHubOutage).not.toHaveBeenCalledWith(expect.anything(), 'pr_list_churn');
  });

  it('records drops on operational shrink path so future returns are detected even when assessor trusted the shrink', async () => {
    // 10→6 on assigned with operational status → trust-policy split downgrades to
    // trusted_operational_shrink. The tombstone hook still records the 4 drops.
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: makePRList('a', 10) };
    alarmSeqValue = 1;
    fetchAssignedPRs.mockResolvedValue(makePRList('a', 6)); // missing a7..a10

    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    const log = chromeStorageByKey[STORAGE_KEY_PR_TOMBSTONES] as
      | { byList?: { assigned?: Array<{ prKey: string; droppedAtAlarmSeq: number }> } }
      | undefined;
    const droppedKeys = (log?.byList?.assigned ?? []).map((t) => t.prKey).sort();
    expect(droppedKeys).toEqual(['a10', 'a7', 'a8', 'a9']);
  });
});

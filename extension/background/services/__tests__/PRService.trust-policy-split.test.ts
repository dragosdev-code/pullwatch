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
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
  STORAGE_KEY_MERGED_PRS,
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

function snapshot(
  prComponentStatus: GitHubStatusSnapshot['prComponentStatus'],
  globalIndicator: GitHubStatusSnapshot['globalIndicator'] = 'none'
): GitHubStatusSnapshot {
  return { prComponentStatus, globalIndicator, fetchedAt: T0 };
}

function makePRList(prefix: string, count: number): PullRequest[] {
  return Array.from({ length: count }, (_, i) =>
    makePR({ id: `${prefix}${i + 1}`, url: `https://github.com/o/r/pull/${prefix}${i + 1}` })
  );
}

describe('PRService trust-policy split (operational partial drop)', () => {
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

  const debugService = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  const rateLimitStub = {
    recordSuccess: vi.fn(),
    recordRateLimitHit: vi.fn(),
  };

  function makeService() {
    return new PRService({
      debugService: debugService as never,
      storageService: {
        getStoredPRs,
        setStoredPRs,
        getGitHubViewerIdentity,
        getExtensionSettings,
        remove: vi.fn().mockResolvedValue(undefined),
        setLastFetchTime,
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
      rateLimitService: rateLimitStub as never,
      healthStatusService: {
        clearParserBreakage: vi.fn().mockResolvedValue(undefined),
        clearGitHubOutage,
        signalParserBreakage: vi.fn().mockResolvedValue(undefined),
        signalGitHubOutage,
      } as never,
      gitHubStatusClient: {
        getStatus,
      } as never,
      alarmSeqClock: {
        current: vi.fn().mockResolvedValue(0),
        advance: vi.fn().mockResolvedValue(1),
      } as never,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.clearAllMocks();
    chromeStorageByKey = {};
    storageGet.mockReset().mockImplementation(async (key?: string | string[]) => {
      if (typeof key === 'string') return { [key]: chromeStorageByKey[key] };
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((k) => [k, chromeStorageByKey[k]]));
      }
      return { ...chromeStorageByKey };
    });
    storageSet.mockReset().mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(chromeStorageByKey, items);
    });
    storageRemove.mockReset().mockResolvedValue(undefined);

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
    getStatus = vi.fn().mockResolvedValue(snapshot('operational', 'none'));
    signalGitHubOutage = vi.fn().mockResolvedValue(undefined);
    clearGitHubOutage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigned: operational partial 10→4 persists fresh list, NO outage signal', async () => {
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: makePRList('a', 10) };
    const fresh = makePRList('a', 4); // keep first 4 of 10
    fetchAssignedPRs.mockResolvedValue(fresh);

    const pr = makeService();
    const out = await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(out.length).toBe(4);
    expect(setStoredPRs).toHaveBeenCalledWith(
      STORAGE_KEY_ASSIGNED_PRS,
      expect.arrayContaining([
        expect.objectContaining({ id: 'a1' }),
        expect.objectContaining({ id: 'a4' }),
      ])
    );
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: expect.anything() })
    );
  });

  it('authored: operational partial 10→4 persists fresh list, NO outage signal', async () => {
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: makePRList('au', 10) };
    const fresh = makePRList('au', 4);
    fetchAuthoredPRs.mockResolvedValue(fresh);

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(out.length).toBe(4);
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, expect.any(Array));
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('merged: operational partial with missing=4 (>= threshold) STAYS suspicious, returns oldPRs', async () => {
    const oldPrs = makePRList('m', 10);
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: oldPrs };
    const fresh = makePRList('m', 6); // missing 4 (m7..m10)
    fetchMergedPRs.mockResolvedValue(fresh);

    const pr = makeService();
    const out = await pr.updateMergedPRs(false, true);

    expect(out).toBe(oldPrs);
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('Suspicious merged list'),
      'pr_component_degraded'
    );
    expect(storageSet).toHaveBeenCalledWith({
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: T0,
    });
  });

  it('merged: operational partial with missing=3 (< threshold) downgrades to trusted_operational_shrink', async () => {
    const oldPrs = makePRList('m', 10);
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: oldPrs };
    const fresh = makePRList('m', 7); // missing 3 (m8..m10)
    fetchMergedPRs.mockResolvedValue(fresh);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, expect.any(Array));
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('merged: implicit stale baseline when identity matches but stored rows are another author (disjoint fresh, operational)', async () => {
    const oldPrs = Array.from({ length: 8 }, (_, i) =>
      makePR({
        id: `https://github.com/other-account/example-repo/pull/${i + 1}`,
        url: `https://github.com/other-account/example-repo/pull/${i + 1}`,
        type: 'merged',
        author: [{ login: 'other-account' }],
        number: i + 1,
        repoName: 'other-account/example-repo',
      })
    );
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: oldPrs };
    getGitHubViewerIdentity.mockResolvedValue({ login: 'dragosdev-code' });
    getLastResolvedViewerLogin.mockReturnValue('dragosdev-code');
    const fresh: PullRequest[] = [
      makePR({
        id: 'https://github.com/dragosdev-code/acme-app/pull/100',
        url: 'https://github.com/dragosdev-code/acme-app/pull/100',
        type: 'merged',
        author: [{ login: 'dragosdev-code' }],
        number: 100,
        repoName: 'dragosdev-code/acme-app',
      }),
      makePR({
        id: 'https://github.com/dragosdev-code/acme-app/pull/101',
        url: 'https://github.com/dragosdev-code/acme-app/pull/101',
        type: 'merged',
        author: [{ login: 'dragosdev-code' }],
        number: 101,
        repoName: 'dragosdev-code/acme-app',
      }),
    ];
    fetchMergedPRs.mockResolvedValue(fresh);

    const pr = makeService();
    const out = await pr.updateMergedPRs(false, true, snapshot('operational', 'none'));

    expect(out).toHaveLength(2);
    expect(out.every((p) => p.isNew === false)).toBe(true);
    expect(out.map((p) => p.url).sort()).toEqual(fresh.map((p) => p.url).sort());
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(createMergedPRVisuals).not.toHaveBeenCalled();
    const mergedCall = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_MERGED_PRS);
    expect(mergedCall).toBeDefined();
    expect(mergedCall![1]).toHaveLength(2);
    expect(mergedCall![1].every((p: PullRequest) => p.isNew === false)).toBe(true);
  });

  it('assigned: degraded partial drop still escalates (suspect_partial path preserved)', async () => {
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: makePRList('a', 10) };
    const fresh = makePRList('a', 4);
    fetchAssignedPRs.mockResolvedValue(fresh);
    getStatus.mockResolvedValue(snapshot('partial_outage'));

    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('Suspicious assigned list'),
      'pr_component_degraded'
    );
  });

  it('assigned: unknown_status partial drop stays suspicious (conservative; unknown != operational confidence)', async () => {
    storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: makePRList('a', 10) };
    const fresh = makePRList('a', 4);
    fetchAssignedPRs.mockResolvedValue(fresh);
    // Statuspage 'unknown' with no global incident → fail-open status; assessor still tags
    // partial_drop_unknown_status which routes to suspect_partial (not operational shrink).
    getStatus.mockResolvedValue(snapshot('unknown', 'none'));

    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('Suspicious assigned list'),
      'pr_component_degraded'
    );
  });
});

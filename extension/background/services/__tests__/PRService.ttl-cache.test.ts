import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('../../../common/utils', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

import { PRService } from '../PRService';
import type { PullRequest } from '../../../common/types';
import {
  CACHE_TTL_MS,
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../../../common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '../../../common/extension-settings-defaults';

type StoredPRData = { prs: PullRequest[]; timestamp?: number };

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

/** Frozen clock so TTL boundaries are deterministic. */
const T0 = new Date('2026-04-14T12:00:00.000Z').getTime();

describe('PRService TTL list cache (tryTtlCachedPrList)', () => {
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
  let showAssignedPRNotifications: Mock;
  let showMergedPRNotifications: Mock;
  let setPRCountBadge: Mock;
  let storedByKey: Record<string, StoredPRData | null>;

  const debugService = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  const healthStub = {
    clearParserBreakage: vi.fn().mockResolvedValue(undefined),
    clearGitHubOutage: vi.fn().mockResolvedValue(undefined),
    signalParserBreakage: vi.fn().mockResolvedValue(undefined),
    signalGitHubOutage: vi.fn().mockResolvedValue(undefined),
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
        showAssignedPRNotifications,
        showMergedPRNotifications,
      } as never,
      badgeService: {
        setPRCountBadge,
        setErrorBadge: vi.fn(),
      } as never,
      rateLimitService: rateLimitStub as never,
      healthStatusService: healthStub as never,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    vi.clearAllMocks();

    const assignedPrs = [makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' })];
    const mergedPrs = [makePR({ id: 'm1', url: 'https://github.com/o/r/pull/2', type: 'merged' })];
    const authoredPrs = [makePR({ id: 'au1', url: 'https://github.com/o/r/pull/3' })];

    storedByKey = {
      [STORAGE_KEY_ASSIGNED_PRS]: { prs: assignedPrs, timestamp: T0 - 30_000 },
      [STORAGE_KEY_MERGED_PRS]: { prs: mergedPrs, timestamp: T0 - 30_000 },
      [STORAGE_KEY_AUTHORED_PRS]: { prs: authoredPrs, timestamp: T0 - 30_000 },
    };

    getStoredPRs = vi.fn(async (key: string) => storedByKey[key] ?? null);
    setStoredPRs = vi.fn(async (key: string, prs: PullRequest[]) => {
      storedByKey[key] = { prs, timestamp: Date.now() };
    });
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'viewer' });
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);
    fetchAssignedPRs = vi.fn().mockResolvedValue([makePR({ id: 'fresh-a', url: 'https://github.com/o/r/pull/99' })]);
    fetchReviewedPRs = vi.fn().mockResolvedValue([]);
    fetchMergedPRs = vi.fn().mockResolvedValue([
      makePR({ id: 'fresh-m', url: 'https://github.com/o/r/pull/199', type: 'merged' }),
    ]);
    fetchAuthoredPRs = vi.fn().mockResolvedValue([
      makePR({ id: 'fresh-au', url: 'https://github.com/o/r/pull/299' }),
    ]);
    getLastResolvedViewerLogin = vi.fn().mockReturnValue('viewer');
    showAssignedPRNotifications = vi.fn().mockResolvedValue(undefined);
    showMergedPRNotifications = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('assigned — fetchAndUpdateAssignedPRs', () => {
    it('cache HIT: (forceRefresh=false, bypassCache=false) skips GitHub, settings, persist, recordSuccess', async () => {
      const pr = makeService();
      const out = await pr.fetchAndUpdateAssignedPRs(false, false);

      expect(out).toEqual(storedByKey[STORAGE_KEY_ASSIGNED_PRS]!.prs);
      expect(fetchAssignedPRs).not.toHaveBeenCalled();
      expect(fetchReviewedPRs).not.toHaveBeenCalled();
      expect(getExtensionSettings).not.toHaveBeenCalled();
      expect(setStoredPRs).not.toHaveBeenCalled();
      expect(setLastFetchTime).not.toHaveBeenCalled();
      expect(showAssignedPRNotifications).not.toHaveBeenCalled();
      expect(setPRCountBadge).not.toHaveBeenCalled();
      expect(rateLimitStub.recordSuccess).not.toHaveBeenCalled();
      expect(debugService.log).toHaveBeenCalledWith('[PRService] Returning cached Assigned PRs');
    });

    it('cache MISS: stale timestamp (age >= CACHE_TTL_MS) runs full pipeline', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
        prs: [makePR({ id: 'old', url: 'https://github.com/o/r/pull/1' })],
        timestamp: T0 - CACHE_TTL_MS - 1,
      };
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, false);

      expect(fetchAssignedPRs).toHaveBeenCalledTimes(1);
      expect(fetchReviewedPRs).toHaveBeenCalledTimes(1);
      expect(getExtensionSettings).toHaveBeenCalled();
      expect(setStoredPRs).toHaveBeenCalled();
      expect(rateLimitStub.recordSuccess).toHaveBeenCalled();
    });

    it('cache MISS: bypassCache=true (alarm-style) even when timestamp is fresh', async () => {
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, true);

      expect(fetchAssignedPRs).toHaveBeenCalledTimes(1);
      expect(debugService.log).not.toHaveBeenCalledWith('[PRService] Returning cached Assigned PRs');
    });

    it('cache MISS: forceRefresh=true even when timestamp is fresh', async () => {
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(true, false);

      expect(fetchAssignedPRs).toHaveBeenCalledTimes(1);
      expect(debugService.log).not.toHaveBeenCalledWith('[PRService] Returning cached Assigned PRs');
    });

    it('cache MISS: timestamp 0 is falsy — does not treat as valid TTL anchor', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
        prs: [makePR({ id: 'x', url: 'https://github.com/o/r/pull/1' })],
        timestamp: 0,
      };
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, false);

      expect(fetchAssignedPRs).toHaveBeenCalled();
      expect(debugService.log).not.toHaveBeenCalledWith('[PRService] Returning cached Assigned PRs');
    });

    it('cache MISS: missing timestamp property', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
        prs: [makePR({ id: 'x', url: 'https://github.com/o/r/pull/1' })],
      };
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, false);

      expect(fetchAssignedPRs).toHaveBeenCalled();
    });

    it('boundary: age exactly CACHE_TTL_MS is not a hit (strict <)', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
        prs: [makePR({ id: 'b', url: 'https://github.com/o/r/pull/1' })],
        timestamp: T0 - CACHE_TTL_MS,
      };
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, false);

      expect(fetchAssignedPRs).toHaveBeenCalledTimes(1);
    });

    it('boundary: age CACHE_TTL_MS - 1ms is still a hit', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
        prs: [makePR({ id: 'c', url: 'https://github.com/o/r/pull/1' })],
        timestamp: T0 - CACHE_TTL_MS + 1,
      };
      const pr = makeService();
      const out = await pr.fetchAndUpdateAssignedPRs(false, false);

      expect(out).toEqual(storedByKey[STORAGE_KEY_ASSIGNED_PRS]!.prs);
      expect(fetchAssignedPRs).not.toHaveBeenCalled();
    });

    it('second call after first refresh uses cache (HIT) without second GitHub round-trip', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = {
        prs: [makePR({ id: 'seed', url: 'https://github.com/o/r/pull/1' })],
        timestamp: T0 - CACHE_TTL_MS - 1,
      };
      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, false);
      expect(fetchAssignedPRs).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();

      const out2 = await pr.fetchAndUpdateAssignedPRs(false, false);
      expect(fetchAssignedPRs).not.toHaveBeenCalled();
      expect(out2).toEqual(storedByKey[STORAGE_KEY_ASSIGNED_PRS]!.prs);
      expect(debugService.log).toHaveBeenCalledWith('[PRService] Returning cached Assigned PRs');
    });
  });

  describe('merged — updateMergedPRs', () => {
    it('cache HIT skips fetchMergedPRs, setStoredPRs, recordSuccess', async () => {
      const pr = makeService();
      const out = await pr.updateMergedPRs(false, false);

      expect(out).toEqual(storedByKey[STORAGE_KEY_MERGED_PRS]!.prs);
      expect(fetchMergedPRs).not.toHaveBeenCalled();
      expect(setStoredPRs).not.toHaveBeenCalled();
      expect(showMergedPRNotifications).not.toHaveBeenCalled();
      expect(rateLimitStub.recordSuccess).not.toHaveBeenCalled();
      expect(debugService.log).toHaveBeenCalledWith('[PRService] Returning cached Merged PRs');
    });

    it('cache MISS when stale runs fetch and recordSuccess', async () => {
      storedByKey[STORAGE_KEY_MERGED_PRS] = {
        prs: [makePR({ id: 'm', url: 'https://github.com/o/r/pull/2', type: 'merged' })],
        timestamp: T0 - CACHE_TTL_MS - 1,
      };
      const pr = makeService();
      await pr.updateMergedPRs(false, false);

      expect(fetchMergedPRs).toHaveBeenCalledTimes(1);
      expect(rateLimitStub.recordSuccess).toHaveBeenCalled();
    });

    it('forceRefresh bypasses cache', async () => {
      const pr = makeService();
      await pr.updateMergedPRs(true, false);
      expect(fetchMergedPRs).toHaveBeenCalledTimes(1);
    });
  });

  describe('authored — updateAuthoredPRs', () => {
    it('cache HIT skips fetchAuthoredPRs, setStoredPRs, recordSuccess', async () => {
      const pr = makeService();
      const out = await pr.updateAuthoredPRs(false, false);

      expect(out).toEqual(storedByKey[STORAGE_KEY_AUTHORED_PRS]!.prs);
      expect(fetchAuthoredPRs).not.toHaveBeenCalled();
      expect(setStoredPRs).not.toHaveBeenCalled();
      expect(rateLimitStub.recordSuccess).not.toHaveBeenCalled();
      expect(debugService.log).toHaveBeenCalledWith('[PRService] Returning cached Authored PRs');
    });

    it('cache MISS when stale runs fetch and recordSuccess', async () => {
      storedByKey[STORAGE_KEY_AUTHORED_PRS] = {
        prs: [makePR({ id: 'au', url: 'https://github.com/o/r/pull/3' })],
        timestamp: T0 - CACHE_TTL_MS - 1,
      };
      const pr = makeService();
      await pr.updateAuthoredPRs(false, false);

      expect(fetchAuthoredPRs).toHaveBeenCalledTimes(1);
      expect(rateLimitStub.recordSuccess).toHaveBeenCalled();
    });

    it('bypassCache bypasses cache', async () => {
      const pr = makeService();
      await pr.updateAuthoredPRs(false, true);
      expect(fetchAuthoredPRs).toHaveBeenCalledTimes(1);
    });
  });
});

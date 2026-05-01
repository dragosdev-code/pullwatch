import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { PRService } from '../PRService';
import type { PullRequest } from '@common/types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_ROUTE_HINT,
} from '@common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';

type StoredPRData = { prs: PullRequest[]; timestamp: number } | null;

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

describe('PRService account swap (silent baseline)', () => {
  let getStoredPRs: Mock;
  let setStoredPRs: Mock;
  let getGitHubViewerIdentity: Mock;
  let getExtensionSettings: Mock;
  let remove: Mock;
  let setLastFetchTime: Mock;
  let fetchAssignedPRs: Mock;
  let fetchReviewedPRs: Mock;
  let fetchMergedPRs: Mock;
  let fetchAuthoredPRs: Mock;
  let getLastResolvedViewerLogin: Mock;
  let showAssignedPRNotifications: Mock;
  let showMergedPRNotifications: Mock;
  let setPRCountBadge: Mock;
  let storedByKey: Record<string, StoredPRData>;

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

  beforeEach(() => {
    vi.clearAllMocks();

    storedByKey = {
      [STORAGE_KEY_ASSIGNED_PRS]: {
        prs: [makePR({ id: 'old-1', url: 'https://github.com/o/r/pull/99', reviewStatus: 'pending' })],
        timestamp: 0,
      },
      [STORAGE_KEY_MERGED_PRS]: {
        prs: [makePR({ id: 'merged-old', url: 'https://github.com/o/r/pull/101', type: 'merged' })],
        timestamp: 0,
      },
      [STORAGE_KEY_AUTHORED_PRS]: {
        prs: [makePR({ id: 'authored-old', url: 'https://github.com/o/r/pull/201' })],
        timestamp: 0,
      },
    };

    getStoredPRs = vi.fn(async (key: string) => storedByKey[key] ?? null);
    setStoredPRs = vi.fn(async (key: string, prs: PullRequest[]) => {
      storedByKey[key] = { prs, timestamp: Date.now() };
    });
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'alice' });
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    remove = vi.fn().mockResolvedValue(undefined);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);
    fetchAssignedPRs = vi.fn().mockResolvedValue([
      makePR({ id: 'new-1', url: 'https://github.com/a/b/pull/1', title: 'PR one' }),
      makePR({ id: 'new-2', url: 'https://github.com/a/b/pull/2', title: 'PR two' }),
    ]);
    fetchReviewedPRs = vi.fn().mockResolvedValue([]);
    fetchMergedPRs = vi.fn().mockResolvedValue([
      makePR({ id: 'merged-1', url: 'https://github.com/a/b/pull/301', type: 'merged' }),
      makePR({ id: 'merged-2', url: 'https://github.com/a/b/pull/302', type: 'merged' }),
    ]);
    fetchAuthoredPRs = vi.fn().mockResolvedValue([
      makePR({ id: 'authored-1', url: 'https://github.com/a/b/pull/401', isNew: true }),
      makePR({ id: 'authored-2', url: 'https://github.com/a/b/pull/402', isNew: true }),
    ]);
    getLastResolvedViewerLogin = vi.fn().mockReturnValue('bob');
    showAssignedPRNotifications = vi.fn().mockResolvedValue(undefined);
    showMergedPRNotifications = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
  });

  function makeService() {
    return new PRService({
      debugService: debugService as never,
      storageService: {
        getStoredPRs,
        setStoredPRs,
        getGitHubViewerIdentity,
        getExtensionSettings,
        remove,
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
      gitHubStatusClient: {
        getStatus: vi.fn().mockResolvedValue({
          prComponentStatus: 'operational',
          globalIndicator: 'none',
          fetchedAt: 0,
        }),
      } as never,
    });
  }

  it('identity mismatch: assigned path stays silent and persists without isNew', async () => {
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(showAssignedPRNotifications).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);

    const assignedCall = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_ASSIGNED_PRS);
    expect(assignedCall).toBeDefined();
    const written: PullRequest[] = assignedCall![1];
    expect(written).toHaveLength(2);
    expect(written.every((p) => p.isNew !== true)).toBe(true);
    expect(setPRCountBadge).toHaveBeenCalledWith(2);
  });

  it('identity mismatch: assigned empty result replaces old-account cache without outage', async () => {
    fetchAssignedPRs.mockResolvedValue([]);
    fetchReviewedPRs.mockResolvedValue([]);

    const pr = makeService();
    const assigned = await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(assigned).toEqual([]);
    expect(showAssignedPRNotifications).not.toHaveBeenCalled();
    expect(healthStub.signalGitHubOutage).not.toHaveBeenCalled();
    expect(healthStub.clearGitHubOutage).toHaveBeenCalled();
    expect(setPRCountBadge).toHaveBeenCalledWith(0);

    const assignedCall = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_ASSIGNED_PRS);
    expect(assignedCall).toBeDefined();
    expect(assignedCall![1]).toEqual([]);
  });

  it('identity mismatch: merged path skips notifications and strips isNew', async () => {
    const pr = makeService();
    const merged = await pr.updateMergedPRs(false, true);

    expect(showMergedPRNotifications).not.toHaveBeenCalled();
    expect(merged.every((p) => p.isNew !== true)).toBe(true);
  });

  it('identity mismatch: merged empty result replaces old-account cache without outage', async () => {
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    const merged = await pr.updateMergedPRs(false, true);

    expect(merged).toEqual([]);
    expect(showMergedPRNotifications).not.toHaveBeenCalled();
    expect(healthStub.signalGitHubOutage).not.toHaveBeenCalled();
    expect(healthStub.clearGitHubOutage).toHaveBeenCalled();

    const mergedCall = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_MERGED_PRS);
    expect(mergedCall).toBeDefined();
    expect(mergedCall![1]).toEqual([]);
  });

  it('identity mismatch: authored path persists all rows with isNew false', async () => {
    const pr = makeService();
    const authored = await pr.updateAuthoredPRs(false, true);

    expect(authored.every((p) => p.isNew !== true)).toBe(true);
    const authoredCall = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_AUTHORED_PRS);
    expect(authoredCall).toBeDefined();
    const written: PullRequest[] = authoredCall![1];
    expect(written.every((p) => p.isNew !== true)).toBe(true);
  });

  it('identity mismatch: authored empty result replaces old-account cache without outage', async () => {
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    const authored = await pr.updateAuthoredPRs(false, true);

    expect(authored).toEqual([]);
    expect(healthStub.signalGitHubOutage).not.toHaveBeenCalled();
    expect(healthStub.clearGitHubOutage).toHaveBeenCalled();

    const authoredCall = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_AUTHORED_PRS);
    expect(authoredCall).toBeDefined();
    expect(authoredCall![1]).toEqual([]);
  });

  it('no stored identity (first install path): not treated as swap', async () => {
    getGitHubViewerIdentity.mockResolvedValue(null);
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(showAssignedPRNotifications).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);
  });

  it('same identity: preserves normal notification behavior', async () => {
    getGitHubViewerIdentity.mockResolvedValue({ login: 'bob' });
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(showAssignedPRNotifications).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);
  });

  it('null current login: does not infer account swap', async () => {
    getLastResolvedViewerLogin.mockReturnValue(null);
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(showAssignedPRNotifications).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);
  });
});

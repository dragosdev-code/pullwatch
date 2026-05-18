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
  let createAssignedPRVisuals: Mock;
  let createMergedPRVisuals: Mock;
  let playAssignedSound: Mock;
  let playMergedSound: Mock;
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
        prs: [
          makePR({ id: 'old-1', url: 'https://github.com/o/r/pull/99', reviewStatus: 'pending' }),
        ],
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
    fetchAssignedPRs = vi
      .fn()
      .mockResolvedValue([
        makePR({ id: 'new-1', url: 'https://github.com/a/b/pull/1', title: 'PR one' }),
        makePR({ id: 'new-2', url: 'https://github.com/a/b/pull/2', title: 'PR two' }),
      ]);
    fetchReviewedPRs = vi.fn().mockResolvedValue([]);
    fetchMergedPRs = vi
      .fn()
      .mockResolvedValue([
        makePR({ id: 'merged-1', url: 'https://github.com/a/b/pull/301', type: 'merged' }),
        makePR({ id: 'merged-2', url: 'https://github.com/a/b/pull/302', type: 'merged' }),
      ]);
    fetchAuthoredPRs = vi
      .fn()
      .mockResolvedValue([
        makePR({ id: 'authored-1', url: 'https://github.com/a/b/pull/401', isNew: true }),
        makePR({ id: 'authored-2', url: 'https://github.com/a/b/pull/402', isNew: true }),
      ]);
    getLastResolvedViewerLogin = vi.fn().mockReturnValue('bob');
    createAssignedPRVisuals = vi.fn().mockResolvedValue({ fired: true });
    createMergedPRVisuals = vi.fn().mockResolvedValue({ fired: true });
    playAssignedSound = vi.fn().mockResolvedValue(undefined);
    playMergedSound = vi.fn().mockResolvedValue(undefined);
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
      healthStatusService: healthStub as never,
      gitHubStatusClient: {
        getStatus: vi.fn().mockResolvedValue({
          prComponentStatus: 'operational',
          globalIndicator: 'none',
          fetchedAt: 0,
        }),
      } as never,
      alarmSeqClock: {
        current: vi.fn().mockResolvedValue(0),
        advance: vi.fn().mockResolvedValue(1),
      } as never,
    });
  }

  it('identity mismatch: assigned path stays silent and persists without isNew', async () => {
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(createAssignedPRVisuals).not.toHaveBeenCalled();
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
    expect(createAssignedPRVisuals).not.toHaveBeenCalled();
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

    expect(createMergedPRVisuals).not.toHaveBeenCalled();
    expect(merged.every((p) => p.isNew !== true)).toBe(true);
  });

  it('identity mismatch: merged empty result replaces old-account cache without outage', async () => {
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    const merged = await pr.updateMergedPRs(false, true);

    expect(merged).toEqual([]);
    expect(createMergedPRVisuals).not.toHaveBeenCalled();
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

    expect(createAssignedPRVisuals).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);
  });

  it('same identity: preserves normal notification behavior', async () => {
    getGitHubViewerIdentity.mockResolvedValue({ login: 'bob' });
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(createAssignedPRVisuals).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);
  });

  it('null current login: does not infer account swap', async () => {
    getLastResolvedViewerLogin.mockReturnValue(null);
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(createAssignedPRVisuals).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEY_ROUTE_HINT);
  });
});

describe('PRService.persistResolvedViewerIdentity — F3 partial-refresh swap', () => {
  let getStoredPRs: Mock;
  let setStoredPRs: Mock;
  let getGitHubViewerIdentity: Mock;
  let setGitHubViewerIdentity: Mock;
  let getExtensionSettings: Mock;
  let remove: Mock;
  let setLastFetchTime: Mock;
  let fetchAssignedPRs: Mock;
  let fetchReviewedPRs: Mock;
  let fetchMergedPRs: Mock;
  let fetchAuthoredPRs: Mock;
  let getLastResolvedViewerLogin: Mock;
  let storedByKey: Record<string, StoredPRData>;

  const debugService = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const healthStub = {
    clearParserBreakage: vi.fn().mockResolvedValue(undefined),
    clearGitHubOutage: vi.fn().mockResolvedValue(undefined),
    signalParserBreakage: vi.fn().mockResolvedValue(undefined),
    signalGitHubOutage: vi.fn().mockResolvedValue(undefined),
  };
  const rateLimitStub = { recordSuccess: vi.fn(), recordRateLimitHit: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    storedByKey = {
      [STORAGE_KEY_ASSIGNED_PRS]: {
        prs: [makePR({ id: 'old-assigned', url: 'https://github.com/o/r/pull/99' })],
        timestamp: 0,
      },
      [STORAGE_KEY_MERGED_PRS]: {
        prs: [makePR({ id: 'old-merged', url: 'https://github.com/o/r/pull/101', type: 'merged' })],
        timestamp: 0,
      },
      [STORAGE_KEY_AUTHORED_PRS]: {
        prs: [makePR({ id: 'old-authored', url: 'https://github.com/o/r/pull/201' })],
        timestamp: 0,
      },
    };
    getStoredPRs = vi.fn(async (key: string) => storedByKey[key] ?? null);
    setStoredPRs = vi.fn(async (key: string, prs: PullRequest[]) => {
      storedByKey[key] = { prs, timestamp: Date.now() };
    });
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'alice' });
    setGitHubViewerIdentity = vi.fn().mockResolvedValue(undefined);
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    remove = vi.fn().mockResolvedValue(undefined);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);
    fetchAssignedPRs = vi
      .fn()
      .mockResolvedValue([makePR({ id: 'fresh-1', url: 'https://github.com/a/b/pull/1' })]);
    fetchReviewedPRs = vi.fn().mockResolvedValue([]);
    fetchMergedPRs = vi
      .fn()
      .mockResolvedValue([
        makePR({ id: 'fresh-merged', url: 'https://github.com/a/b/pull/301', type: 'merged' }),
      ]);
    fetchAuthoredPRs = vi
      .fn()
      .mockResolvedValue([
        makePR({ id: 'fresh-authored', url: 'https://github.com/a/b/pull/401' }),
      ]);
    getLastResolvedViewerLogin = vi.fn().mockReturnValue('bob');
  });

  function makeService() {
    return new PRService({
      debugService: debugService as never,
      storageService: {
        getStoredPRs,
        setStoredPRs,
        getGitHubViewerIdentity,
        setGitHubViewerIdentity,
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
        createAssignedPRVisuals: vi.fn().mockResolvedValue({ fired: true }),
        createMergedPRVisuals: vi.fn().mockResolvedValue({ fired: true }),
        playAssignedSound: vi.fn(),
        playMergedSound: vi.fn(),
        showAssignedPRNotifications: vi.fn(),
        showMergedPRNotifications: vi.fn(),
      } as never,
      badgeService: {
        setPRCountBadge: vi.fn(),
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
      alarmSeqClock: {
        current: vi.fn().mockResolvedValue(0),
        advance: vi.fn().mockResolvedValue(1),
      } as never,
    });
  }

  it('clears stored PRs for lists that did not refresh this cycle when swap is detected', async () => {
    const pr = makeService();
    // Only assigned runs this cycle. Merged + authored never fetched (e.g., they errored).
    await pr.fetchAndUpdateAssignedPRs(false, true);

    setStoredPRs.mockClear();
    await pr.persistResolvedViewerIdentity();

    const mergedClear = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_MERGED_PRS);
    const authoredClear = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_AUTHORED_PRS);
    const assignedClear = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_ASSIGNED_PRS);

    expect(mergedClear).toBeDefined();
    expect(mergedClear![1]).toEqual([]);
    expect(authoredClear).toBeDefined();
    expect(authoredClear![1]).toEqual([]);
    expect(assignedClear).toBeUndefined();

    expect(setGitHubViewerIdentity).toHaveBeenCalledWith(expect.objectContaining({ login: 'bob' }));
  });

  it('clears a list that refreshed before the final viewer changed', async () => {
    getLastResolvedViewerLogin.mockReturnValue('alice');
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    getLastResolvedViewerLogin.mockReturnValue('bob');
    setStoredPRs.mockClear();
    await pr.persistResolvedViewerIdentity();

    const assignedClear = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_ASSIGNED_PRS);
    const mergedClear = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_MERGED_PRS);
    const authoredClear = setStoredPRs.mock.calls.find((c) => c[0] === STORAGE_KEY_AUTHORED_PRS);

    expect(assignedClear).toBeDefined();
    expect(assignedClear![1]).toEqual([]);
    expect(mergedClear).toBeDefined();
    expect(mergedClear![1]).toEqual([]);
    expect(authoredClear).toBeDefined();
    expect(authoredClear![1]).toEqual([]);
    expect(setGitHubViewerIdentity).toHaveBeenCalledWith(expect.objectContaining({ login: 'bob' }));
  });

  it('does not clear any list when all three refreshed under the new account', async () => {
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);
    await pr.updateMergedPRs(false, true);
    await pr.updateAuthoredPRs(false, true);

    setStoredPRs.mockClear();
    await pr.persistResolvedViewerIdentity();

    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(setGitHubViewerIdentity).toHaveBeenCalledWith(expect.objectContaining({ login: 'bob' }));
  });

  it('does not clear lists on same-account refresh', async () => {
    getGitHubViewerIdentity.mockResolvedValue({ login: 'bob' });
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);

    setStoredPRs.mockClear();
    await pr.persistResolvedViewerIdentity();

    expect(setStoredPRs).not.toHaveBeenCalled();
  });

  it('skips clear when current login is null (cannot confirm swap)', async () => {
    getLastResolvedViewerLogin.mockReturnValue(null);
    const pr = makeService();
    setStoredPRs.mockClear();
    await pr.persistResolvedViewerIdentity();

    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(setGitHubViewerIdentity).not.toHaveBeenCalled();
  });

  it('cycle state resets between waves so refresh markers do not leak', async () => {
    const pr = makeService();

    // Wave 1: assigned only, swap → clears merged + authored.
    await pr.fetchAndUpdateAssignedPRs(false, true);
    await pr.persistResolvedViewerIdentity();

    // Wave 2: now baseline = bob (storage updated). Same login → no clear, no leak from wave 1's set.
    getGitHubViewerIdentity.mockResolvedValue({ login: 'bob' });
    setStoredPRs.mockClear();
    await pr.persistResolvedViewerIdentity();

    expect(setStoredPRs).not.toHaveBeenCalled();
  });
});

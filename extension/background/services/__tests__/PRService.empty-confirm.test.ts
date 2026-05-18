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
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_PR_LIST_TRUST,
} from '@common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';
import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { PRListTrustState } from '@background/domain/pr-list-trust';

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

/**
 * Tests for the EmptyConfirmationTracker integration in PRService. Exercises
 * the silent N-poll confirmation period for empty PR-list transitions, the
 * recovery baseline marker, and the corroborated escalation path. Account-swap
 * regressions live in `PRService.account-swap.test.ts`; transport / parser /
 * outage-error paths live in `PRService.outage-gate.test.ts`.
 */
describe('PRService empty-confirmation tracker', () => {
  let getStoredPRs: Mock;
  let setStoredPRs: Mock;
  let getGitHubViewerIdentity: Mock;
  let getExtensionSettings: Mock;
  let setLastFetchTime: Mock;
  let storageServiceGet: Mock;
  let storageServiceSet: Mock;
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
  /** Persists `STORAGE_KEY_PR_LIST_TRUST` across service calls so streak state survives. */
  let trustState: PRListTrustState;

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
        get: storageServiceGet,
        set: storageServiceSet,
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
    trustState = {};
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

    storedByKey = {
      [STORAGE_KEY_ASSIGNED_PRS]: {
        prs: [
          makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' }),
          makePR({ id: 'a2', url: 'https://github.com/o/r/pull/2' }),
          makePR({ id: 'a3', url: 'https://github.com/o/r/pull/3' }),
        ],
      },
      [STORAGE_KEY_MERGED_PRS]: {
        prs: [
          makePR({ id: 'm1', url: 'https://github.com/o/r/pull/11', type: 'merged' }),
          makePR({ id: 'm2', url: 'https://github.com/o/r/pull/12', type: 'merged' }),
          makePR({ id: 'm3', url: 'https://github.com/o/r/pull/13', type: 'merged' }),
        ],
      },
      [STORAGE_KEY_AUTHORED_PRS]: {
        prs: [
          makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' }),
          makePR({ id: 'au2', url: 'https://github.com/o/r/pull/22' }),
          makePR({ id: 'au3', url: 'https://github.com/o/r/pull/23' }),
        ],
      },
    };

    getStoredPRs = vi.fn(async (key: string) => storedByKey[key] ?? null);
    setStoredPRs = vi.fn(async (key: string, prs: PullRequest[]) => {
      storedByKey[key] = { prs, timestamp: Date.now() };
    });
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'viewer' });
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);

    // WHY [in-memory trust store]: PrListTrustStore.read/write call
    // storageService.get/set with STORAGE_KEY_PR_LIST_TRUST. Persisting across
    // calls is what lets the empty-confirmation streak advance between polls.
    storageServiceGet = vi.fn(async (key: string) => {
      if (key === STORAGE_KEY_PR_LIST_TRUST) return trustState;
      return chromeStorageByKey[key];
    });
    storageServiceSet = vi.fn(async (key: string, value: unknown) => {
      if (key === STORAGE_KEY_PR_LIST_TRUST) {
        trustState = value as PRListTrustState;
        return;
      }
      chromeStorageByKey[key] = value;
    });

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

  it('A. authored legitimate zero — first poll is silent pending, no banner, no metadata write', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAuthoredPRs.mockResolvedValue([]);
    const oldPRs = storedByKey[STORAGE_KEY_AUTHORED_PRS]!.prs;

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(out).toBe(oldPRs);
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: expect.anything() })
    );
    expect(trustState.lists?.authored?.emptyConfirm?.streak).toBe(1);
  });

  it('B. authored legitimate zero — second poll accepts, persists [] silently', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateAuthoredPRs(false, true);
    expect(trustState.lists?.authored?.emptyConfirm?.streak).toBe(1);

    fetchAuthoredPRs.mockResolvedValue([]);
    const out = await pr.updateAuthoredPRs(false, true);

    expect(out).toEqual([]);
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, []);
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(clearGitHubOutage).toHaveBeenCalled();
    expect(trustState.lists?.authored?.emptyConfirm).toBeUndefined();
    expect(trustState.lists?.authored?.recoveryBaseline).toBe('accepted_empty');
  });

  it('C. assigned legitimate zero — two consecutive empties accept silently with badge zero', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAssignedPRs.mockResolvedValue([]);
    fetchReviewedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);
    expect(trustState.lists?.assigned?.emptyConfirm?.streak).toBe(1);

    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_ASSIGNED_PRS, []);
    expect(setPRCountBadge).toHaveBeenLastCalledWith(0);
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(createAssignedPRVisuals).not.toHaveBeenCalled();
    expect(trustState.lists?.assigned?.recoveryBaseline).toBe('accepted_empty');
  });

  it('D. flaky single empty + recovery — streak resets, no notifications, no banner', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    const original = storedByKey[STORAGE_KEY_MERGED_PRS]!.prs;

    fetchMergedPRs.mockResolvedValueOnce([]);
    const pr = makeService();
    await pr.updateMergedPRs(false, true);
    expect(trustState.lists?.merged?.emptyConfirm?.streak).toBe(1);
    expect(setStoredPRs).not.toHaveBeenCalled();

    // tick 2 — same PRs return; trusted branch consumes streak
    fetchMergedPRs.mockResolvedValueOnce(original);
    await pr.updateMergedPRs(false, true);

    expect(trustState.lists?.merged?.emptyConfirm).toBeUndefined();
    expect(createMergedPRVisuals).not.toHaveBeenCalled();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('E. sustained empty + Statuspage flips actively bad mid-streak → corroborated outage', async () => {
    fetchMergedPRs.mockResolvedValue([]);
    const pr = makeService();

    getStatus.mockResolvedValueOnce(snapshot('operational'));
    await pr.updateMergedPRs(false, true);
    expect(trustState.lists?.merged?.emptyConfirm?.streak).toBe(1);
    expect(signalGitHubOutage).not.toHaveBeenCalled();

    getStatus.mockResolvedValueOnce(snapshot('partial_outage'));
    await pr.updateMergedPRs(false, true);

    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('corroborated'),
      'pr_component_degraded'
    );
    expect(trustState.lists?.merged?.emptyConfirm).toBeUndefined();
  });

  it('F. post-accept recovery — returning PRs route through markAsExistingBaseline (no notification storm)', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));

    // Two empty polls → accept []
    fetchAuthoredPRs.mockResolvedValueOnce([]);
    fetchAuthoredPRs.mockResolvedValueOnce([]);
    const pr = makeService();
    await pr.updateAuthoredPRs(false, true);
    await pr.updateAuthoredPRs(false, true);
    expect(trustState.lists?.authored?.recoveryBaseline).toBe('accepted_empty');

    // tick 3 — fresh has two PRs returning; marker consumed → all isNew=false
    const recovered = [
      makePR({ id: 'au-r1', url: 'https://github.com/o/r/pull/901', isNew: true }),
      makePR({ id: 'au-r2', url: 'https://github.com/o/r/pull/902', isNew: true }),
    ];
    fetchAuthoredPRs.mockResolvedValueOnce(recovered);
    await pr.updateAuthoredPRs(false, true);

    const persisted = setStoredPRs.mock.calls.at(-1)![1] as PullRequest[];
    expect(persisted).toHaveLength(2);
    expect(persisted.every((p) => p.isNew === false)).toBe(true);
    expect(trustState.lists?.authored?.recoveryBaseline).toBeUndefined();
  });

  it('F′. post-accept empty trusted tick keeps recovery marker until non-empty fetch', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));

    fetchAuthoredPRs.mockResolvedValueOnce([]);
    fetchAuthoredPRs.mockResolvedValueOnce([]);
    fetchAuthoredPRs.mockResolvedValueOnce([]);
    const pr = makeService();
    await pr.updateAuthoredPRs(false, true);
    await pr.updateAuthoredPRs(false, true);
    expect(trustState.lists?.authored?.recoveryBaseline).toBe('accepted_empty');

    await pr.updateAuthoredPRs(false, true);
    expect(trustState.lists?.authored?.recoveryBaseline).toBe('accepted_empty');

    const recovered = [
      makePR({ id: 'au-r1', url: 'https://github.com/o/r/pull/901', isNew: true }),
      makePR({ id: 'au-r2', url: 'https://github.com/o/r/pull/902', isNew: true }),
    ];
    fetchAuthoredPRs.mockResolvedValueOnce(recovered);
    await pr.updateAuthoredPRs(false, true);

    const persisted = setStoredPRs.mock.calls.at(-1)![1] as PullRequest[];
    expect(persisted).toHaveLength(2);
    expect(persisted.every((p) => p.isNew === false)).toBe(true);
    expect(trustState.lists?.authored?.recoveryBaseline).toBeUndefined();
  });

  it('G. merged legitimate zero — three consecutive polls required (N=3)', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchMergedPRs.mockResolvedValue([]);
    const pr = makeService();

    await pr.updateMergedPRs(false, true);
    expect(trustState.lists?.merged?.emptyConfirm?.streak).toBe(1);
    expect(setStoredPRs).not.toHaveBeenCalled();

    await pr.updateMergedPRs(false, true);
    expect(trustState.lists?.merged?.emptyConfirm?.streak).toBe(2);
    expect(setStoredPRs).not.toHaveBeenCalled();

    await pr.updateMergedPRs(false, true);
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, []);
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(createMergedPRVisuals).not.toHaveBeenCalled();
  });

  it('H. account swap mid-streak — tracker cleared, no outage signal', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAssignedPRs.mockResolvedValue([]);
    fetchReviewedPRs.mockResolvedValue([]);

    // streak=1 under viewer "alice"
    getGitHubViewerIdentity.mockResolvedValue({ login: 'alice' });
    getLastResolvedViewerLogin.mockReturnValue('alice');
    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(false, true);
    expect(trustState.lists?.assigned?.emptyConfirm?.streak).toBe(1);

    // swap to "bob" — detectAccountSwap branch fires, clears tracker
    getGitHubViewerIdentity.mockResolvedValue({ login: 'alice' }); // baseline frozen
    getLastResolvedViewerLogin.mockReturnValue('bob');
    fetchAssignedPRs.mockResolvedValue([]);
    fetchReviewedPRs.mockResolvedValue([]);
    await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(trustState.lists?.assigned?.emptyConfirm).toBeUndefined();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('K. cold start (stored=[]) — assessor short-circuits, no streak created', async () => {
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(trustState.lists?.merged?.emptyConfirm).toBeUndefined();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, []);
  });

  it('L. forceRefresh during empty pending does NOT bypass silent path', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAssignedPRs.mockResolvedValue([]);
    fetchReviewedPRs.mockResolvedValue([]);
    const oldPRs = storedByKey[STORAGE_KEY_ASSIGNED_PRS]!.prs;

    const pr = makeService();
    const out = await pr.fetchAndUpdateAssignedPRs(true, true);

    expect(out).toBe(oldPRs);
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(trustState.lists?.assigned?.emptyConfirm?.streak).toBe(1);
  });

  it('M. degraded_performance status alone does NOT corroborate empty (silent pending)', async () => {
    // WHY [stricter than isProblematicPRStatus]: degraded_performance frequently
    // fires for issues unrelated to PR search HTML; we hold a tighter line for
    // empty corroboration than for partial-drop strictness.
    getStatus.mockResolvedValue(snapshot('degraded_performance'));
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateAuthoredPRs(false, true);

    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(trustState.lists?.authored?.emptyConfirm?.streak).toBe(1);
  });

  it('N. streak survives service restart — second poll on a fresh PRService instance still accepts', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr1 = makeService();
    await pr1.updateAuthoredPRs(false, true);
    expect(trustState.lists?.authored?.emptyConfirm?.streak).toBe(1);

    // Simulate service-worker eviction — fresh PRService re-reads persisted state.
    const pr2 = makeService();
    fetchAuthoredPRs.mockResolvedValue([]);
    await pr2.updateAuthoredPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, []);
    expect(trustState.lists?.authored?.recoveryBaseline).toBe('accepted_empty');
  });

  it('outage flag absent during pending — chrome.storage.local never sees STORAGE_KEY_GITHUB_OUTAGE write', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateAuthoredPRs(false, true);

    expect(storageSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_KEY_GITHUB_OUTAGE]: expect.anything() })
    );
    expect(chromeStorageByKey[STORAGE_KEY_GITHUB_OUTAGE]).toBeUndefined();
  });
});

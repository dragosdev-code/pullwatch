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
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_PR_LIST_TRUST,
} from '@common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';
import { ParserBreakageError } from '@common/errors';
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
 * Regression coverage for the cross-list prune in `doUpdateAuthoredPRs`. When the
 * authored-list trust gate rejects a fresh fetch (suspect_partial,
 * suspect_empty_pending, suspect_empty_corroborated) or the fetch errors, the old
 * behavior preserved `oldPRs` without writing storage — so a PR that had legitimately
 * moved into the merged list this same wave stayed visible on the Authored tab until
 * the streak threshold or a manual refresh fired. The fix reads merged storage at
 * the top of the authored update and prunes preserved entries whose key is now in
 * merged, persisting the reconciled list.
 */
describe('PRService cross-list prune (authored vs merged storage)', () => {
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
  let showAssignedPRNotifications: Mock;
  let showMergedPRNotifications: Mock;
  let setPRCountBadge: Mock;
  let getStatus: Mock;
  let signalGitHubOutage: Mock;
  let signalParserBreakage: Mock;
  let clearGitHubOutage: Mock;
  let storedByKey: Record<string, StoredPRData | null>;
  let chromeStorageByKey: Record<string, unknown>;
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
        showAssignedPRNotifications,
        showMergedPRNotifications,
      } as never,
      badgeService: {
        setPRCountBadge,
        setErrorBadge: vi.fn(),
      } as never,
      rateLimitService: rateLimitStub as never,
      healthStatusService: {
        clearParserBreakage: vi.fn().mockResolvedValue(undefined),
        clearGitHubOutage,
        signalParserBreakage,
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

    storedByKey = {};

    getStoredPRs = vi.fn(async (key: string) => storedByKey[key] ?? null);
    setStoredPRs = vi.fn(async (key: string, prs: PullRequest[]) => {
      storedByKey[key] = { prs, timestamp: Date.now() };
    });
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'viewer' });
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);

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
    showAssignedPRNotifications = vi.fn().mockResolvedValue(undefined);
    showMergedPRNotifications = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
    getStatus = vi.fn().mockResolvedValue(snapshot('operational'));
    signalGitHubOutage = vi.fn().mockResolvedValue(undefined);
    signalParserBreakage = vi.fn().mockResolvedValue(undefined);
    clearGitHubOutage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. primary regression: merged update advances + authored suspect_empty_pending → authored prunes the now-merged PR', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
    getStatus.mockResolvedValue(snapshot('operational'));

    // Same PR id in merged-fetch (the user merged their own authored PR)
    fetchMergedPRs.mockResolvedValue([
      makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' }),
    ]);
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);
    const out = await pr.updateAuthoredPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(
      STORAGE_KEY_MERGED_PRS,
      expect.arrayContaining([expect.objectContaining({ id: 'au1' })])
    );
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, []);
    expect(out).toEqual([]);
    expect(showMergedPRNotifications).toHaveBeenCalledTimes(1);
    expect(signalGitHubOutage).not.toHaveBeenCalled();
    // Streak math unchanged — the prune does not advance / clear the empty tracker.
    expect(trustState.lists?.authored?.emptyConfirm?.streak).toBe(1);
  });

  it('2. no-op when merged storage is empty', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    // merged storage missing entirely
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(out).toEqual([au1]);
  });

  it('3. no-op when authored shrink has no overlap with merged storage', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    const au2 = makePR({ id: 'au2', url: 'https://github.com/o/r/pull/22' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1, au2] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = {
      prs: [makePR({ id: 'm99', url: 'https://github.com/o/r/pull/99', type: 'merged' })],
    };
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(setStoredPRs).not.toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, expect.anything());
    expect(out).toEqual([au1, au2]);
  });

  it('4. partial prune — only authored entries present in merged are dropped', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    const au2 = makePR({ id: 'au2', url: 'https://github.com/o/r/pull/22' });
    const au3 = makePR({ id: 'au3', url: 'https://github.com/o/r/pull/23' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1, au2, au3] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };

    fetchMergedPRs.mockResolvedValue([
      makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' }),
    ]);
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);
    const out = await pr.updateAuthoredPRs(false, true);

    const persistedAuthored = setStoredPRs.mock.calls.find(
      ([k]) => k === STORAGE_KEY_AUTHORED_PRS
    )?.[1] as PullRequest[];
    expect(persistedAuthored).toBeDefined();
    expect(persistedAuthored.map((p) => p.id)).toEqual(['au2', 'au3']);
    expect(out.map((p) => p.id)).toEqual(['au2', 'au3']);
  });

  it('5a. suspect_partial branch (non-empty fresh, degraded flavor) — pruned authored persisted', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    const au2 = makePR({ id: 'au2', url: 'https://github.com/o/r/pull/22' });
    const au3 = makePR({ id: 'au3', url: 'https://github.com/o/r/pull/23' });
    const au4 = makePR({ id: 'au4', url: 'https://github.com/o/r/pull/24' });
    const au5 = makePR({ id: 'au5', url: 'https://github.com/o/r/pull/25' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1, au2, au3, au4, au5] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = {
      prs: [makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' })],
    };

    // partial_outage forces `degraded` flavor in the assessor; dispatcher then routes
    // suspect_partial to the suspect_partial handler (NOT trusted_operational_shrink, which
    // fires only on `operational` flavor for authored).
    getStatus.mockResolvedValue(snapshot('partial_outage'));
    fetchAuthoredPRs.mockResolvedValue([au2]); // 4 missing — meets degradedDropThreshold

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    const persistedAuthored = setStoredPRs.mock.calls.find(
      ([k]) => k === STORAGE_KEY_AUTHORED_PRS
    )?.[1] as PullRequest[];
    expect(persistedAuthored).toBeDefined();
    // au1 pruned because it appears in merged storage; au2-au5 preserved as suspect.
    expect(persistedAuthored.map((p) => p.id).sort()).toEqual(['au2', 'au3', 'au4', 'au5']);
    expect(out.map((p) => p.id).sort()).toEqual(['au2', 'au3', 'au4', 'au5']);
    expect(signalGitHubOutage).toHaveBeenCalled();
  });

  it('5. suspect_empty_corroborated branch — partial_outage status reroutes second empty to corroborated, prune still fires', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = {
      prs: [makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' })],
    };

    getStatus.mockResolvedValue(snapshot('partial_outage'));
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, []);
    expect(out).toEqual([]);
    expect(signalGitHubOutage).toHaveBeenCalled();
  });

  it('6. catch path (ParserBreakageError) — preserved oldPRs are reconciled against merged storage', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = {
      prs: [makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' })],
    };

    fetchAuthoredPRs.mockRejectedValue(new ParserBreakageError('authored fetch'));

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, []);
    expect(out).toEqual([]);
    expect(signalParserBreakage).toHaveBeenCalled();
  });

  it('7. manual-refresh-style invocation (forceRefresh=true) prunes against pre-existing merged storage', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    // merged storage already contains the PR from a prior alarm
    storedByKey[STORAGE_KEY_MERGED_PRS] = {
      prs: [makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' })],
    };

    fetchAuthoredPRs.mockResolvedValue([]);
    const pr = makeService();
    const out = await pr.updateAuthoredPRs(true, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_AUTHORED_PRS, []);
    expect(out).toEqual([]);
  });

  it('8. doubly-suspect wave (merged returned oldPRs too) — authored prune is a no-op this tick', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };

    fetchMergedPRs.mockResolvedValue([]);
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);
    const out = await pr.updateAuthoredPRs(false, true);

    // Merged stored=[] + fresh=[] short-circuits to trusted (cold-start parity), merged writes [].
    // What matters for the prune limitation is: merged storage carries no NEW key for au1, so
    // the authored prune cannot help this tick — authored stays untouched.
    const authoredWrites = setStoredPRs.mock.calls.filter(([k]) => k === STORAGE_KEY_AUTHORED_PRS);
    expect(authoredWrites).toHaveLength(0);
    expect(out).toEqual([au1]);
  });

  it('9. pruned write does not double-fire merged notifications', async () => {
    const au1 = makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' });
    storedByKey[STORAGE_KEY_AUTHORED_PRS] = { prs: [au1] };
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };

    fetchMergedPRs.mockResolvedValue([
      makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21', type: 'merged' }),
    ]);
    fetchAuthoredPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);
    await pr.updateAuthoredPRs(false, true);

    expect(showMergedPRNotifications).toHaveBeenCalledTimes(1);
    expect(showAssignedPRNotifications).not.toHaveBeenCalled();
  });
});

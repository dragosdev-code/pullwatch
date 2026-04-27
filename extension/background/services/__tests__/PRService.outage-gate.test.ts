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

describe('PRService outage gate', () => {
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
  let getStatus: Mock;
  let signalGitHubOutage: Mock;
  let clearGitHubOutage: Mock;
  let storedByKey: Record<string, StoredPRData | null>;

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
        signalParserBreakage: vi.fn().mockResolvedValue(undefined),
        signalGitHubOutage,
      } as never,
      gitHubStatusClient: {
        getStatus,
      } as never,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.clearAllMocks();
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    storageRemove.mockReset().mockResolvedValue(undefined);

    storedByKey = {
      [STORAGE_KEY_ASSIGNED_PRS]: {
        prs: [
          makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' }),
          makePR({ id: 'a2', url: 'https://github.com/o/r/pull/2' }),
          makePR({ id: 'a3', url: 'https://github.com/o/r/pull/3' }),
          makePR({ id: 'a4', url: 'https://github.com/o/r/pull/4' }),
          makePR({ id: 'a5', url: 'https://github.com/o/r/pull/5' }),
        ],
        // timestamp omitted so TTL cache misses and the fetch path runs.
      },
      [STORAGE_KEY_MERGED_PRS]: {
        prs: [
          makePR({ id: 'm1', url: 'https://github.com/o/r/pull/11', type: 'merged' }),
          makePR({ id: 'm2', url: 'https://github.com/o/r/pull/12', type: 'merged' }),
          makePR({ id: 'm3', url: 'https://github.com/o/r/pull/13', type: 'merged' }),
        ],
      },
      [STORAGE_KEY_AUTHORED_PRS]: {
        prs: [makePR({ id: 'au1', url: 'https://github.com/o/r/pull/21' })],
      },
    };

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
    showAssignedPRNotifications = vi.fn().mockResolvedValue(undefined);
    showMergedPRNotifications = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
    getStatus = vi.fn().mockResolvedValue(snapshot('operational', 'none'));
    signalGitHubOutage = vi.fn().mockResolvedValue(undefined);
    clearGitHubOutage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. storm path (assigned): empty fresh + non-empty stored + partial_outage → no notify, no PR persist, metadata + outage signal written', async () => {
    getStatus.mockResolvedValue(snapshot('partial_outage'));
    const oldPRs = storedByKey[STORAGE_KEY_ASSIGNED_PRS]!.prs;

    const pr = makeService();
    const out = await pr.fetchAndUpdateAssignedPRs(false, true);

    expect(out).toBe(oldPRs);
    // WHY [sound suppression]: notification fan-out is the single suppression point. Since
    // showAssignedPRNotifications is the boundary that internally drives sound, asserting it was
    // never called also proves the per-category sound is not played during the storm path.
    expect(showAssignedPRNotifications).not.toHaveBeenCalled();
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(setLastFetchTime).not.toHaveBeenCalled();
    expect(setPRCountBadge).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('Empty assigned list'),
      'pr_component_degraded'
    );
    expect(storageSet).toHaveBeenCalledWith({
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: T0,
    });
    expect(clearGitHubOutage).not.toHaveBeenCalled();
    expect(rateLimitStub.recordSuccess).not.toHaveBeenCalled();
  });

  it('2. storm path (merged): empty fresh + non-empty stored + major_outage → no notify, no PR persist, metadata written', async () => {
    getStatus.mockResolvedValue(snapshot('major_outage'));
    const oldPRs = storedByKey[STORAGE_KEY_MERGED_PRS]!.prs;

    const pr = makeService();
    const out = await pr.updateMergedPRs(false, true);

    expect(out).toBe(oldPRs);
    expect(showMergedPRNotifications).not.toHaveBeenCalled();
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('Empty merged list'),
      'pr_component_degraded'
    );
    expect(storageSet).toHaveBeenCalledWith({
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: T0,
    });
  });

  it('3. legitimate empty (healthy): empty fresh + non-empty stored + operational → flow proceeds, persist happens, clearGitHubOutage called', async () => {
    getStatus.mockResolvedValue(snapshot('operational', 'none'));
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(showMergedPRNotifications).not.toHaveBeenCalled();
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, []);
    expect(clearGitHubOutage).toHaveBeenCalled();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('4. recovery on next tick: tick1 storm leaves storage intact; tick2 healthy + fresh non-empty fires only the new PR', async () => {
    const merged0 = storedByKey[STORAGE_KEY_MERGED_PRS]!.prs;

    // tick1 — storm
    getStatus.mockResolvedValueOnce(snapshot('partial_outage'));
    fetchMergedPRs.mockResolvedValueOnce([]);
    const pr = makeService();
    await pr.updateMergedPRs(false, true);
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(showMergedPRNotifications).not.toHaveBeenCalled();
    expect(storedByKey[STORAGE_KEY_MERGED_PRS]!.prs).toBe(merged0);

    // tick2 — healthy, original 3 + 1 new
    getStatus.mockResolvedValueOnce(snapshot('operational', 'none'));
    const recovered = [
      ...merged0,
      makePR({ id: 'm-new', url: 'https://github.com/o/r/pull/77', type: 'merged' }),
    ];
    fetchMergedPRs.mockResolvedValueOnce(recovered);

    await pr.updateMergedPRs(false, true);

    expect(showMergedPRNotifications).toHaveBeenCalledTimes(1);
    const notifiedPRs = showMergedPRNotifications.mock.calls[0]![0] as PullRequest[];
    expect(notifiedPRs).toHaveLength(1);
    expect(notifiedPRs[0]!.id).toBe('m-new');
  });

  it('5. fail-OPEN: status returns unknown → gate inactive, normal compare runs', async () => {
    getStatus.mockResolvedValue(snapshot('unknown', 'unknown'));
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, []);
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('6. cold start: stored empty + fresh empty + degraded status → gate inactive (oldLength === 0)', async () => {
    storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
    getStatus.mockResolvedValue(snapshot('major_outage'));
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, []);
  });

  it('7. manual refresh during outage: forceRefresh does NOT bypass the gate', async () => {
    getStatus.mockResolvedValue(snapshot('partial_outage'));
    fetchMergedPRs.mockResolvedValue([]);
    const oldPRs = storedByKey[STORAGE_KEY_MERGED_PRS]!.prs;

    const pr = makeService();
    const out = await pr.updateMergedPRs(true, true);

    expect(out).toBe(oldPRs);
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalled();
    expect(storageSet).toHaveBeenCalledWith({
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: T0,
    });
  });

  it('8. manual refresh + healthy + fresh non-empty: gate inactive, line-449 notify-skip still fires', async () => {
    getStatus.mockResolvedValue(snapshot('operational'));
    fetchAssignedPRs.mockResolvedValue([
      makePR({ id: 'fresh-1', url: 'https://github.com/o/r/pull/901' }),
      makePR({ id: 'fresh-2', url: 'https://github.com/o/r/pull/902' }),
    ]);

    const pr = makeService();
    await pr.fetchAndUpdateAssignedPRs(true, true);

    // line-449 notify-skip on forceRefresh remains intact.
    expect(showAssignedPRNotifications).not.toHaveBeenCalled();
    // Persist still happens — gate is inactive.
    expect(setStoredPRs).toHaveBeenCalled();
    expect(signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('9. global non-none + PR component operational: gate does NOT fire (component-primary)', async () => {
    getStatus.mockResolvedValue(snapshot('operational', 'critical'));
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(setStoredPRs).toHaveBeenCalledWith(STORAGE_KEY_MERGED_PRS, []);
  });

  it('10. global non-none + PR component unknown: gate fires via fallback', async () => {
    getStatus.mockResolvedValue(snapshot('unknown', 'major'));
    fetchMergedPRs.mockResolvedValue([]);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(signalGitHubOutage).toHaveBeenCalled();
    expect(setStoredPRs).not.toHaveBeenCalled();
  });

  it('11. smaller-but-non-empty fresh (10 stored, 3 fresh, partial_outage): gate does NOT fire (no percentage-drop policy)', async () => {
    getStatus.mockResolvedValue(snapshot('partial_outage'));
    storedByKey[STORAGE_KEY_MERGED_PRS] = {
      prs: Array.from({ length: 10 }, (_, i) =>
        makePR({
          id: `m-${i}`,
          url: `https://github.com/o/r/pull/${100 + i}`,
          type: 'merged',
        })
      ),
    };
    const fresh = Array.from({ length: 3 }, (_, i) =>
      makePR({
        id: `m-${i}`,
        url: `https://github.com/o/r/pull/${100 + i}`,
        type: 'merged',
      })
    );
    fetchMergedPRs.mockResolvedValue(fresh);

    const pr = makeService();
    await pr.updateMergedPRs(false, true);

    expect(signalGitHubOutage).not.toHaveBeenCalled();
    expect(setStoredPRs).toHaveBeenCalled();
  });

  it('12. authored gate: empty fresh + non-empty stored + degraded → no persist, metadata written', async () => {
    getStatus.mockResolvedValue(snapshot('major_outage'));
    fetchAuthoredPRs.mockResolvedValue([]);
    const oldPRs = storedByKey[STORAGE_KEY_AUTHORED_PRS]!.prs;

    const pr = makeService();
    const out = await pr.updateAuthoredPRs(false, true);

    expect(out).toBe(oldPRs);
    expect(setStoredPRs).not.toHaveBeenCalled();
    expect(signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('Empty authored list'),
      'pr_component_degraded'
    );
  });
});

import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { PRService } from '../PRService';
import type { PullRequest } from '../../../common/types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_ROUTE_HINT,
} from '../../../common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '../StorageService';

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
  let getLastResolvedViewerLogin: Mock;
  let showAssignedPRNotifications: Mock;
  let setPRCountBadge: Mock;

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
    getStoredPRs = vi.fn();
    setStoredPRs = vi.fn().mockResolvedValue(undefined);
    getGitHubViewerIdentity = vi.fn().mockResolvedValue({ login: 'alice' });
    getExtensionSettings = vi.fn().mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);
    remove = vi.fn().mockResolvedValue(undefined);
    setLastFetchTime = vi.fn().mockResolvedValue(undefined);
    fetchAssignedPRs = vi.fn();
    fetchReviewedPRs = vi.fn();
    getLastResolvedViewerLogin = vi.fn().mockReturnValue('bob');
    showAssignedPRNotifications = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);

    getStoredPRs.mockImplementation(async (key: string) => {
      if (key !== STORAGE_KEY_ASSIGNED_PRS) return null;
      return {
        prs: [makePR({ id: 'old-1', url: 'https://github.com/o/r/pull/99', reviewStatus: 'pending' })],
        timestamp: 0,
      };
    });

    fetchAssignedPRs.mockResolvedValue([
      makePR({ id: 'new-1', url: 'https://github.com/a/b/pull/1', title: 'PR one' }),
      makePR({ id: 'new-2', url: 'https://github.com/a/b/pull/2', title: 'PR two' }),
    ]);
    fetchReviewedPRs.mockResolvedValue([]);
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
        getLastResolvedViewerLogin,
      } as never,
      notificationService: {
        showAssignedPRNotifications,
      } as never,
      badgeService: {
        setPRCountBadge,
        setErrorBadge: vi.fn(),
      } as never,
      rateLimitService: rateLimitStub as never,
      healthStatusService: healthStub as never,
    });
  }

  it('identity mismatch: no assigned notifications, no isNew persisted, badge from pending count', async () => {
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
});

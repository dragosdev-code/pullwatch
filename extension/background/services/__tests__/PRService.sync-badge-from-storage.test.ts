import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { PRService } from '../PRService';
import type { ExtensionSettings, PullRequest } from '@common/types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_PARSER_BREAKAGE,
} from '@common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';

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

describe('PRService.syncBadgeFromStorage', () => {
  let get: Mock;
  let getStoredPRs: Mock;
  let getExtensionSettings: Mock;
  let setPRCountBadge: Mock;
  let setErrorBadge: Mock;

  const debugService = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    get = vi.fn();
    getStoredPRs = vi.fn();
    getExtensionSettings = vi.fn();
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
    setErrorBadge = vi.fn().mockResolvedValue(undefined);
  });

  function makeService() {
    return new PRService({
      debugService: debugService as never,
      storageService: {
        get,
        getStoredPRs,
        getExtensionSettings,
      } as never,
      gitHubService: {} as never,
      notificationService: {} as never,
      badgeService: {
        setPRCountBadge,
        setErrorBadge,
      } as never,
      rateLimitService: {} as never,
      healthStatusService: {} as never,
      gitHubStatusClient: {} as never,
    });
  }

  it('calls setErrorBadge when parser_breakage is present in storage', async () => {
    get.mockImplementation(async (key: string) => {
      if (key === STORAGE_KEY_PARSER_BREAKAGE) return { detected: true };
      if (key === STORAGE_KEY_GITHUB_OUTAGE) return null;
      return null;
    });

    const pr = makeService();
    await pr.syncBadgeFromStorage();

    expect(setErrorBadge).toHaveBeenCalledTimes(1);
    expect(setPRCountBadge).not.toHaveBeenCalled();
  });

  it('calls setErrorBadge when github_outage is present in storage', async () => {
    get.mockImplementation(async (key: string) => {
      if (key === STORAGE_KEY_PARSER_BREAKAGE) return null;
      if (key === STORAGE_KEY_GITHUB_OUTAGE) return { detected: true };
      return null;
    });

    const pr = makeService();
    await pr.syncBadgeFromStorage();

    expect(setErrorBadge).toHaveBeenCalledTimes(1);
    expect(setPRCountBadge).not.toHaveBeenCalled();
  });

  it('sets PR count from stored assigned PRs (pending only, drafts hidden)', async () => {
    get.mockResolvedValue(null);
    getStoredPRs.mockImplementation(async (key: string) => {
      if (key !== STORAGE_KEY_ASSIGNED_PRS) return null;
      return {
        prs: [
          makePR({ id: '1', url: 'u1', reviewStatus: 'pending', type: 'open' }),
          makePR({ id: '2', url: 'u2', reviewStatus: 'pending', type: 'draft' }),
          makePR({ id: '3', url: 'u3', reviewStatus: 'reviewed', type: 'open' }),
        ],
        timestamp: Date.now(),
      };
    });
    const settings: ExtensionSettings = {
      ...DEFAULT_EXTENSION_SETTINGS,
      assigned: { ...DEFAULT_EXTENSION_SETTINGS.assigned, showDraftsInList: false },
    };
    getExtensionSettings.mockResolvedValue(settings);

    const pr = makeService();
    await pr.syncBadgeFromStorage();

    expect(setErrorBadge).not.toHaveBeenCalled();
    expect(setPRCountBadge).toHaveBeenCalledWith(1);
  });

  it('includes drafts in count when showDraftsInList is true', async () => {
    get.mockResolvedValue(null);
    getStoredPRs.mockImplementation(async (key: string) => {
      if (key !== STORAGE_KEY_ASSIGNED_PRS) return null;
      return {
        prs: [
          makePR({ id: '1', url: 'u1', reviewStatus: 'pending', type: 'open' }),
          makePR({ id: '2', url: 'u2', reviewStatus: 'pending', type: 'draft' }),
        ],
        timestamp: Date.now(),
      };
    });
    const settings: ExtensionSettings = {
      ...DEFAULT_EXTENSION_SETTINGS,
      assigned: { ...DEFAULT_EXTENSION_SETTINGS.assigned, showDraftsInList: true },
    };
    getExtensionSettings.mockResolvedValue(settings);

    const pr = makeService();
    await pr.syncBadgeFromStorage();

    expect(setPRCountBadge).toHaveBeenCalledWith(2);
  });

  it('passes zero when no assigned PRs in storage', async () => {
    get.mockResolvedValue(null);
    getStoredPRs.mockResolvedValue(null);
    getExtensionSettings.mockResolvedValue(DEFAULT_EXTENSION_SETTINGS);

    const pr = makeService();
    await pr.syncBadgeFromStorage();

    expect(setPRCountBadge).toHaveBeenCalledWith(0);
  });
});

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
import { STORAGE_KEY_ASSIGNED_PRS, STORAGE_KEY_MERGED_PRS } from '@common/constants';
import { DEFAULT_EXTENSION_SETTINGS } from '@common/extension-settings-defaults';

type StoredPRData = { prs: PullRequest[]; timestamp?: number };

const T0 = new Date('2026-05-18T12:00:00.000Z').getTime();

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

function mergedPR(partial: Partial<PullRequest> & Pick<PullRequest, 'id' | 'url'>): PullRequest {
  return makePR({ ...partial, type: 'merged' });
}

/**
 * WHY [scope]: This suite covers the ordering invariant introduced by the audit fix:
 *
 *   1) visual create
 *   2) `storage.setStoredPRs`
 *   3) sound playback
 *
 * The previous design ran visual + sound *before* persist, which left a multi-second window where
 * a service-worker suspension during sound playback resurrected the PR as "new" on the next alarm
 * and replayed the sound (a ghost sound the user could not attribute to a visible toast). See the
 * "Crash duplicate trade-off" section in wiki/Notifications-and-Sound.md.
 */
describe('PRService notification ordering (visual → persist → sound)', () => {
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
  let warmNotificationAudio: Mock;
  let playAssignedSound: Mock;
  let playMergedSound: Mock;
  let setPRCountBadge: Mock;
  let getStatus: Mock;
  let storedByKey: Record<string, StoredPRData | null>;
  let chromeStorageByKey: Record<string, unknown>;
  let storageGetGeneric: Mock;
  let storageSetGeneric: Mock;
  let alarmSeqValue: number;

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
        warmNotificationAudio,
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
        clearGitHubOutage: vi.fn().mockResolvedValue(undefined),
        signalParserBreakage: vi.fn().mockResolvedValue(undefined),
        signalGitHubOutage: vi.fn().mockResolvedValue(undefined),
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
    warmNotificationAudio = vi.fn().mockResolvedValue(undefined);
    playAssignedSound = vi.fn().mockResolvedValue(undefined);
    playMergedSound = vi.fn().mockResolvedValue(undefined);
    setPRCountBadge = vi.fn().mockResolvedValue(undefined);
    getStatus = vi.fn().mockResolvedValue({
      prComponentStatus: 'operational',
      globalIndicator: 'none',
      fetchedAt: T0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('assigned', () => {
    it('order: warm + createAssignedPRVisuals → setStoredPRs → playAssignedSound', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: [] };
      const fresh = makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' });
      fetchAssignedPRs.mockResolvedValue([fresh]);

      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, true);

      expect(warmNotificationAudio).toHaveBeenCalledTimes(1);
      expect(createAssignedPRVisuals).toHaveBeenCalledTimes(1);
      expect(setStoredPRs).toHaveBeenCalled();
      expect(playAssignedSound).toHaveBeenCalledTimes(1);

      const warmOrder = warmNotificationAudio.mock.invocationCallOrder[0];
      const visualOrder = createAssignedPRVisuals.mock.invocationCallOrder[0];
      const persistOrder = setStoredPRs.mock.invocationCallOrder.find((_o, i) => {
        const callArgs = setStoredPRs.mock.calls[i];
        return callArgs?.[0] === STORAGE_KEY_ASSIGNED_PRS;
      })!;
      const soundOrder = playAssignedSound.mock.invocationCallOrder[0];

      expect(warmOrder).toBeLessThan(visualOrder);
      expect(visualOrder).toBeLessThan(persistOrder);
      expect(persistOrder).toBeLessThan(soundOrder);
    });

    it('crash after persist, before sound: next tick stays silent (no duplicate sound)', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: [] };
      const fresh = makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' });
      fetchAssignedPRs.mockResolvedValue([fresh]);

      // WHY [reject playAssignedSound]: Stand-in for a real worker termination during the sound
      // await. Production sound errors are swallowed by playNotificationSoundForCategory, so
      // playAssignedSound itself does not reject in normal operation; what we are reproducing here
      // is the worst-case shape where the sound-phase await never completes. Persist already
      // happened, so the only thing lost is the sound.
      playAssignedSound.mockRejectedValueOnce(new Error('worker suspended during sound'));

      const pr1 = makeService();
      await expect(pr1.fetchAndUpdateAssignedPRs(false, true)).rejects.toThrow();

      // Stored list should already contain the PR — persist ran before the sound rejection.
      expect(storedByKey[STORAGE_KEY_ASSIGNED_PRS]?.prs.map((p) => p.id)).toEqual(['a1']);

      // Next alarm tick: same fresh response.
      createAssignedPRVisuals.mockClear();
      playAssignedSound.mockClear();
      playAssignedSound.mockResolvedValue(undefined);
      fetchAssignedPRs.mockResolvedValue([fresh]);

      const pr2 = makeService();
      await pr2.fetchAndUpdateAssignedPRs(false, true);

      // PR is already in stored list, comparePRs reports no new PRs → no re-notify, no re-sound.
      expect(createAssignedPRVisuals).not.toHaveBeenCalled();
      expect(playAssignedSound).not.toHaveBeenCalled();
    });

    it('crash before persist: next tick re-notifies and re-sounds (no silent miss)', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: [] };
      const fresh = makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' });
      fetchAssignedPRs.mockResolvedValue([fresh]);

      // WHY [reject createAssignedPRVisuals]: Stand-in for a worker termination during the
      // visual-create round-trip, before storage is touched. We use a reject because that is the
      // shape vitest can observe; in production the worker is killed mid-await and the promise
      // never settles, which from PRService's perspective is the same as never returning.
      createAssignedPRVisuals.mockRejectedValueOnce(
        new Error('worker suspended during visual create')
      );

      const pr1 = makeService();
      await expect(pr1.fetchAndUpdateAssignedPRs(false, true)).rejects.toThrow();

      // Stored list must NOT contain the PR — persist did not run.
      expect(storedByKey[STORAGE_KEY_ASSIGNED_PRS]?.prs ?? []).toEqual([]);

      createAssignedPRVisuals.mockClear();
      playAssignedSound.mockClear();
      createAssignedPRVisuals.mockResolvedValue({ fired: true });
      fetchAssignedPRs.mockResolvedValue([fresh]);

      const pr2 = makeService();
      await pr2.fetchAndUpdateAssignedPRs(false, true);

      // Safety invariant: the PR was never persisted, so the user gets a fresh notify + sound.
      expect(createAssignedPRVisuals).toHaveBeenCalledTimes(1);
      expect(playAssignedSound).toHaveBeenCalledTimes(1);
    });

    it('createAssignedPRVisuals returns { fired: false }: playAssignedSound is NOT called', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: [] };
      const draft = makePR({
        id: 'd1',
        url: 'https://github.com/o/r/pull/1',
        type: 'draft',
      });
      fetchAssignedPRs.mockResolvedValue([draft]);
      createAssignedPRVisuals.mockResolvedValue({ fired: false, reason: 'all_drafts_filtered' });

      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(false, true);

      expect(createAssignedPRVisuals).toHaveBeenCalledTimes(1);
      expect(playAssignedSound).not.toHaveBeenCalled();
      // Persist still runs — the draft is still recorded as seen even though no banner fired.
      expect(setStoredPRs).toHaveBeenCalled();
    });

    it('forceRefresh skips both visual and sound', async () => {
      storedByKey[STORAGE_KEY_ASSIGNED_PRS] = { prs: [] };
      const fresh = makePR({ id: 'a1', url: 'https://github.com/o/r/pull/1' });
      fetchAssignedPRs.mockResolvedValue([fresh]);

      const pr = makeService();
      await pr.fetchAndUpdateAssignedPRs(true, true);

      expect(warmNotificationAudio).not.toHaveBeenCalled();
      expect(createAssignedPRVisuals).not.toHaveBeenCalled();
      expect(playAssignedSound).not.toHaveBeenCalled();
      expect(setStoredPRs).toHaveBeenCalled();
    });
  });

  describe('merged', () => {
    it('order: warm + createMergedPRVisuals → setStoredPRs → playMergedSound', async () => {
      storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
      const fresh = mergedPR({ id: 'm1', url: 'https://github.com/o/r/pull/10' });
      fetchMergedPRs.mockResolvedValue([fresh]);

      const pr = makeService();
      await pr.updateMergedPRs(false, true);

      expect(warmNotificationAudio).toHaveBeenCalledTimes(1);
      expect(createMergedPRVisuals).toHaveBeenCalledTimes(1);
      const mergedPersistIdx = setStoredPRs.mock.calls.findIndex(
        (args) => args[0] === STORAGE_KEY_MERGED_PRS
      );
      expect(mergedPersistIdx).toBeGreaterThanOrEqual(0);
      expect(playMergedSound).toHaveBeenCalledTimes(1);

      const warmOrder = warmNotificationAudio.mock.invocationCallOrder[0];
      const visualOrder = createMergedPRVisuals.mock.invocationCallOrder[0];
      const persistOrder = setStoredPRs.mock.invocationCallOrder[mergedPersistIdx];
      const soundOrder = playMergedSound.mock.invocationCallOrder[0];

      expect(warmOrder).toBeLessThan(visualOrder);
      expect(visualOrder).toBeLessThan(persistOrder);
      expect(persistOrder).toBeLessThan(soundOrder);
    });

    it('crash after persist, before sound: next tick stays silent', async () => {
      storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
      const fresh = mergedPR({ id: 'm1', url: 'https://github.com/o/r/pull/10' });
      fetchMergedPRs.mockResolvedValue([fresh]);

      // Stand-in for worker termination during the sound phase; see the assigned-side comment.
      playMergedSound.mockRejectedValueOnce(new Error('worker suspended during sound'));

      const pr1 = makeService();
      await expect(pr1.updateMergedPRs(false, true)).rejects.toThrow();

      expect(storedByKey[STORAGE_KEY_MERGED_PRS]?.prs.map((p) => p.id)).toEqual(['m1']);

      createMergedPRVisuals.mockClear();
      playMergedSound.mockClear();
      playMergedSound.mockResolvedValue(undefined);
      fetchMergedPRs.mockResolvedValue([fresh]);

      const pr2 = makeService();
      await pr2.updateMergedPRs(false, true);

      expect(createMergedPRVisuals).not.toHaveBeenCalled();
      expect(playMergedSound).not.toHaveBeenCalled();
    });

    it('crash before persist: next tick re-notifies and re-sounds (no silent miss)', async () => {
      storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
      const fresh = mergedPR({ id: 'm1', url: 'https://github.com/o/r/pull/10' });
      fetchMergedPRs.mockResolvedValue([fresh]);

      createMergedPRVisuals.mockRejectedValueOnce(
        new Error('worker suspended during visual create')
      );

      const pr1 = makeService();
      await expect(pr1.updateMergedPRs(false, true)).rejects.toThrow();

      expect(storedByKey[STORAGE_KEY_MERGED_PRS]?.prs ?? []).toEqual([]);

      createMergedPRVisuals.mockClear();
      playMergedSound.mockClear();
      createMergedPRVisuals.mockResolvedValue({ fired: true });
      fetchMergedPRs.mockResolvedValue([fresh]);

      const pr2 = makeService();
      await pr2.updateMergedPRs(false, true);

      expect(createMergedPRVisuals).toHaveBeenCalledTimes(1);
      expect(playMergedSound).toHaveBeenCalledTimes(1);
    });

    it('createMergedPRVisuals returns { fired: false }: playMergedSound is NOT called', async () => {
      storedByKey[STORAGE_KEY_MERGED_PRS] = { prs: [] };
      const fresh = mergedPR({ id: 'm1', url: 'https://github.com/o/r/pull/10' });
      fetchMergedPRs.mockResolvedValue([fresh]);
      createMergedPRVisuals.mockResolvedValue({ fired: false, reason: 'disabled' });

      const pr = makeService();
      await pr.updateMergedPRs(false, true);

      expect(createMergedPRVisuals).toHaveBeenCalledTimes(1);
      expect(playMergedSound).not.toHaveBeenCalled();
      expect(setStoredPRs).toHaveBeenCalled();
    });
  });
});

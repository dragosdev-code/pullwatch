import type { IPRService } from '../interfaces/IPRService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IGitHubService } from '../interfaces/IGitHubService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IBadgeService } from '../interfaces/IBadgeService';
import type { IRateLimitService } from '../interfaces/IRateLimitService';
import type { IHealthStatusService } from '../interfaces/IHealthStatusService';
import type { PullRequest } from '../../common/types';
import {
  CACHE_TTL_MS,
  REQUEST_DELAY_MS,
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_PARSER_BREAKAGE,
  STORAGE_KEY_ROUTE_HINT,
} from '../../common/constants';
import { RateLimitError, ParserBreakageError, GitHubOutageError } from '../../common/errors';
import { delay } from '../../common/utils';

/**
 * WHY [invariant]: One place for “which pending assigned PRs count toward the badge” —
 * same draft filter as {@link PRService.mergeAndFilterAssignedPRs} so storage-backed badge
 * updates and {@link PRService.persistAndNotifyAssigned} always agree.
 */
function filterPendingAssignedByDraftSetting(
  pendingPRs: PullRequest[],
  showDraftsInList: boolean
): PullRequest[] {
  return showDraftsInList ? pendingPRs : pendingPRs.filter((pr) => pr.type !== 'draft');
}

/**
 * PRService handles pull request management and coordination between services.
 * Manages PR fetching, comparison, notifications, and state updates.
 */
export class PRService implements IPRService {
  private debugService: IDebugService;
  private storageService: IStorageService;
  private gitHubService: IGitHubService;
  private notificationService: INotificationService;
  private badgeService: IBadgeService;
  private rateLimitService: IRateLimitService;
  private healthStatusService: IHealthStatusService;
  private initialized = false;
  private assignedFetchInProgress: Promise<PullRequest[]> | null = null;
  private assignedFetchOpts: { forceRefresh: boolean; bypassCache: boolean } | null = null;
  private mergedFetchInProgress: Promise<PullRequest[]> | null = null;
  private mergedFetchOpts: { forceRefresh: boolean; bypassCache: boolean } | null = null;
  private authoredFetchInProgress: Promise<PullRequest[]> | null = null;
  private authoredFetchOpts: { forceRefresh: boolean; bypassCache: boolean } | null = null;
  private cycleBaselineLogin: string | null = null;
  private cycleBaselineLoaded = false;
  private clearedRouteHintForSwapKey: string | null = null;

  constructor(deps: {
    debugService: IDebugService;
    storageService: IStorageService;
    gitHubService: IGitHubService;
    notificationService: INotificationService;
    badgeService: IBadgeService;
    rateLimitService: IRateLimitService;
    healthStatusService: IHealthStatusService;
  }) {
    this.debugService = deps.debugService;
    this.storageService = deps.storageService;
    this.gitHubService = deps.gitHubService;
    this.notificationService = deps.notificationService;
    this.badgeService = deps.badgeService;
    this.rateLimitService = deps.rateLimitService;
    this.healthStatusService = deps.healthStatusService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[PRService] PR service initialized');
  }

  /**
   * WHY [ordering]: Storage identity must not update until the alarm (or manual) cycle finishes
   * so merged/authored still see the pre-cycle login in {@link IStorageService.getGitHubViewerIdentity}
   * and can apply the same silent baseline as assigned.
   */
  async persistResolvedViewerIdentity(): Promise<void> {
    try {
      const login = this.gitHubService.getLastResolvedViewerLogin();
      if (!login) {
        this.debugService.log('[PRService] Skipping viewer identity persist — no resolved login');
        return;
      }
      await this.storageService.setGitHubViewerIdentity({
        login,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.resetSwapCycleState();
    }
  }

  /**
   * WHY [cycle baseline]: Assigned/merged/authored can run in one alarm wake. Cache the
   * stored viewer login once so all three compare against the same pre-cycle identity.
   */
  private async getCycleBaselineLogin(): Promise<string | null> {
    if (!this.cycleBaselineLoaded) {
      const baselineIdentity = await this.storageService.getGitHubViewerIdentity();
      this.cycleBaselineLogin = baselineIdentity?.login ?? null;
      this.cycleBaselineLoaded = true;
    }
    return this.cycleBaselineLogin;
  }

  private resetSwapCycleState(): void {
    this.cycleBaselineLoaded = false;
    this.cycleBaselineLogin = null;
    this.clearedRouteHintForSwapKey = null;
  }

  /**
   * WHY [single side-effect]: Route hint clear is a swap side-effect, not a per-list concern.
   * Keep it idempotent for one baseline->current pair so sequential list fetches do not thrash
   * storage and future reordering still preserves behavior.
   */
  private async clearRouteHintForSwapOnce(
    baselineLogin: string,
    currentLogin: string
  ): Promise<void> {
    const key = `${baselineLogin}->${currentLogin}`;
    if (this.clearedRouteHintForSwapKey === key) return;
    this.clearedRouteHintForSwapKey = key;
    await this.storageService.remove(STORAGE_KEY_ROUTE_HINT);
  }

  /**
   * Compares the last HTML-derived viewer with the cycle's baseline identity.
   * First install (no stored baseline) and unknown current login are intentionally not swaps.
   */
  private async detectAccountSwap(
    logSuffix: string
  ): Promise<{ accountSwap: boolean; baselineLogin: string | null; currentLogin: string | null }> {
    const baselineLogin = await this.getCycleBaselineLogin();
    const currentLogin = this.gitHubService.getLastResolvedViewerLogin();
    const accountSwap = Boolean(baselineLogin && currentLogin && baselineLogin !== currentLogin);

    if (accountSwap && baselineLogin && currentLogin) {
      await this.clearRouteHintForSwapOnce(baselineLogin, currentLogin);
      this.debugService.log(
        `[PRService] GitHub account swap detected (${baselineLogin} → ${currentLogin}); ${logSuffix}`
      );
    }

    return { accountSwap, baselineLogin, currentLogin };
  }

  /**
   * Loads assigned / review-requested PRs from GitHub, merges with the “reviewed” list,
   * writes storage, updates the badge, and shows notifications for PRs that are new
   * relative to the last stored **pending** set (skipped when {@link forceRefresh} is true).
   *
   * **Concurrent calls:** If another fetch is already in progress, this usually awaits the
   * same promise. If this call needs **stricter** flags than the in-flight one (e.g. the
   * alarm passes `bypassCache: true` while a popup started with cache allowed), this method
   * waits for that run to finish, then starts a new fetch with the requested flags. That
   * avoids attaching a cache-only result to a caller that must hit GitHub.
   *
   * @param forceRefresh - Bypass cache and suppress “new PR” notifications (manual refresh, install, startup).
   * @param bypassCache - Ignore the short TTL cache and always refetch (periodic alarm).
   * @returns The current assigned PR list after the effective fetch completes.
   */
  async fetchAndUpdateAssignedPRs(forceRefresh = false, bypassCache = false): Promise<PullRequest[]> {
    while (true) {
      if (this.assignedFetchInProgress && this.assignedFetchOpts) {
        const o = this.assignedFetchOpts;
        const needStricter =
          (bypassCache && !o.bypassCache) || (forceRefresh && !o.forceRefresh);
        if (!needStricter) {
          this.debugService.log('[PRService] Assigned fetch already in progress, reusing');
          return this.assignedFetchInProgress;
        }
        this.debugService.log(
          '[PRService] Assigned fetch in progress with weaker flags; awaiting then retrying'
        );
        await this.assignedFetchInProgress;
        continue;
      }

      this.assignedFetchOpts = { forceRefresh, bypassCache };
      this.assignedFetchInProgress = this.doFetchAndUpdateAssignedPRs(forceRefresh, bypassCache).finally(
        () => {
          this.assignedFetchInProgress = null;
          this.assignedFetchOpts = null;
        }
      );
      return this.assignedFetchInProgress;
    }
  }

  private async doFetchAndUpdateAssignedPRs(forceRefresh: boolean, bypassCache: boolean): Promise<PullRequest[]> {
    this.debugService.log(
      `[PRService] Fetching and updating assigned PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`
    );

    const storedData = await this.storageService.getStoredPRs(STORAGE_KEY_ASSIGNED_PRS);
    const oldPRs = storedData?.prs || [];

    try {
      const cached = await this.checkAssignedCache(forceRefresh, bypassCache);
      if (cached) return cached;

      const oldPendingPRs = oldPRs.filter((pr) => pr.reviewStatus !== 'reviewed');
      const settings = await this.storageService.getExtensionSettings();
      const showDrafts = settings.assigned.showDraftsInList;

      const freshPendingPRsRaw = await this.gitHubService.fetchAssignedPRs();
      let { accountSwap } = await this.detectAccountSwap('silent assigned baseline');

      // WHY [ordering]: If swap is known from the first assigned fetch, clear the stale route
      // hint before the reviewed request so the next fetch in this cycle can probe cleanly.
      await delay(REQUEST_DELAY_MS);
      const freshReviewedPRsRaw = await this.gitHubService.fetchReviewedPRs();

      if (!accountSwap) {
        ({ accountSwap } = await this.detectAccountSwap('silent assigned baseline'));
      }

      const oldPendingForCompare = accountSwap ? [] : oldPendingPRs;

      let { allPRs, filteredPending, newPRs } = this.mergeAndFilterAssignedPRs(
        oldPendingForCompare,
        freshPendingPRsRaw,
        freshReviewedPRsRaw,
        showDrafts
      );

      if (accountSwap) {
        newPRs = [];
        allPRs = allPRs.map((pr) => ({ ...pr, isNew: false }));
        filteredPending = filterPendingAssignedByDraftSetting(
          allPRs.filter((pr) => pr.reviewStatus !== 'reviewed'),
          showDrafts
        );
      }

      await this.persistAndNotifyAssigned(allPRs, filteredPending.length, newPRs, forceRefresh);

      this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.healthStatusService.clearGitHubOutage();
      this.debugService.log(`[PRService] Successfully updated ${allPRs.length} PRs`);
      return allPRs;
    } catch (error) {
      if (error instanceof ParserBreakageError) {
        this.debugService.warn(
          `[PRService] ${error.message} — preserving ${oldPRs.length} stored assigned PRs.`
        );
        await this.badgeService.setErrorBadge();
        await this.healthStatusService.signalParserBreakage(error.message);
        return oldPRs;
      }
      // A GitHub outage is not actionable by the user, so wiping their PR
      // list adds confusion for no benefit. Return stale data and show a
      // distinct banner; the next successful alarm tick refreshes automatically.
      if (error instanceof GitHubOutageError) {
        this.debugService.warn(
          `[PRService] ${error.message} — preserving ${oldPRs.length} stored assigned PRs.`
        );
        await this.badgeService.setErrorBadge();
        await this.healthStatusService.signalGitHubOutage(error.message);
        return oldPRs;
      }
      if (error instanceof RateLimitError) {
        this.rateLimitService.recordRateLimitHit(error.retryAfterSeconds);
      }
      this.debugService.error('[PRService] Error fetching and updating PRs:', error);
      await this.badgeService.setErrorBadge();
      throw error;
    }
  }

  /**
   * Returns cached assigned PRs if the cache is valid, or null if a fresh fetch is needed.
   */
  private async checkAssignedCache(
    forceRefresh: boolean,
    bypassCache: boolean
  ): Promise<PullRequest[] | null> {
    const storedData = await this.storageService.getStoredPRs(STORAGE_KEY_ASSIGNED_PRS);
    const isCacheValid =
      storedData && storedData.timestamp && Date.now() - storedData.timestamp < CACHE_TTL_MS;

    if (isCacheValid && !forceRefresh && !bypassCache) {
      this.debugService.log('[PRService] Returning cached Assigned PRs');
      return storedData.prs;
    }
    return null;
  }

  /**
   * Compares old pending PRs against fresh data, deduplicates reviewed PRs,
   * and applies draft filtering based on user settings.
   */
  private mergeAndFilterAssignedPRs(
    oldPendingPRs: PullRequest[],
    freshPendingRaw: PullRequest[],
    freshReviewedRaw: PullRequest[],
    showDrafts: boolean
  ): { allPRs: PullRequest[]; filteredPending: PullRequest[]; newPRs: PullRequest[] } {
    const freshPending = freshPendingRaw.map((pr) => ({
      ...pr,
      reviewStatus: 'pending' as const,
    }));

    const { newPRs, allPRsWithStatus: pendingPRsWithStatus } = this.comparePRs(
      oldPendingPRs,
      freshPending
    );

    const pendingIds = new Set(pendingPRsWithStatus.map((pr) => pr.id || pr.url));
    const freshReviewed = freshReviewedRaw
      .filter((pr) => !pendingIds.has(pr.id || pr.url))
      .filter((pr) => pr.type !== 'merged')
      .map((pr): PullRequest => ({ ...pr, reviewStatus: 'reviewed' as const, isNew: false }));

    const filteredPending = filterPendingAssignedByDraftSetting(pendingPRsWithStatus, showDrafts);

    const filteredReviewed = showDrafts
      ? freshReviewed
      : freshReviewed.filter((pr) => pr.type !== 'draft');

    return {
      allPRs: [...filteredPending, ...filteredReviewed],
      filteredPending,
      newPRs,
    };
  }

  /**
   * Sends notifications for new assigned PRs, then persists the full list and
   * updates the badge.
   *
   * WHY notify before persist: If the MV3 service worker is terminated
   * mid-execution (or an error is thrown after storage writes), the new PR
   * would be marked as "seen" in chrome.storage.local without the user ever
   * receiving a notification. On the next alarm wake, comparePRs would skip
   * it because it is already in the stored list. By notifying first, a
   * worst-case crash causes a duplicate notification on the next tick (safe)
   * rather than a silently lost one (not safe).
   */
  private async persistAndNotifyAssigned(
    allPRs: PullRequest[],
    filteredPendingCount: number,
    newPRs: PullRequest[],
    forceRefresh: boolean
  ): Promise<void> {
    if (newPRs.length > 0 && !forceRefresh) {
      this.debugService.log(`[PRService] Showing notifications for ${newPRs.length} new PR(s)`);
      await this.notificationService.showAssignedPRNotifications(newPRs);
    }

    await this.storageService.setStoredPRs(STORAGE_KEY_ASSIGNED_PRS, allPRs);
    await this.storageService.setLastFetchTime(Date.now());
    await this.badgeService.setPRCountBadge(filteredPendingCount);
  }

  /**
   * Compares old and new PR lists to identify new PRs.
   * Only considers PRs as "new" if they weren't in the old list (not when PRs are missing).
   *
   * INVARIANT: `oldPRs` must come from the **previous** alarm tick's
   * persisted storage — never from a fetch performed in the same wake cycle.
   * If any code writes fresh GitHub data to storage before the alarm handler
   * calls this method, `oldPRs` will already contain the genuinely new PR
   * and the comparison will produce `newPRs = []`, silently swallowing the
   * notification. See BackgroundManager.performInitialSetup for the full
   * explanation of why per-wake PR seeding is forbidden.
   */
  public comparePRs(
    oldPRs: PullRequest[],
    freshPRs: PullRequest[]
  ): {
    newPRs: PullRequest[];
    allPRsWithStatus: PullRequest[];
  } {
    this.debugService.log('[PRService] Comparing PR lists...');

    // Create a map of old PRs for efficient lookup
    const oldPRMap = new Map<string, PullRequest>();
    oldPRs.forEach((pr) => {
      // Use ID as primary key, fallback to URL if ID is not available
      const key = pr.id || pr.url;
      oldPRMap.set(key, pr);
    });

    const newPRs: PullRequest[] = [];
    const allPRsWithStatus: PullRequest[] = [];

    // Process each fresh PR
    freshPRs.forEach((freshPR) => {
      const key = freshPR.id || freshPR.url;
      const existingPR = oldPRMap.get(key);

      const reviewStatus = freshPR.reviewStatus ?? 'pending';

      if (!existingPR) {
        // This is a new PR - mark it as new and add to new PRs list
        this.debugService.log(`[PRService] New PR detected: ${freshPR.title} (${key})`);
        const newPR = { ...freshPR, isNew: true, reviewStatus };
        newPRs.push(newPR);
        allPRsWithStatus.push(newPR);
      } else {
        // This PR already existed - preserve it but mark as not new
        const existingPRUpdated = { ...freshPR, isNew: false, reviewStatus };
        allPRsWithStatus.push(existingPRUpdated);
        this.debugService.log(`[PRService] Existing PR: ${freshPR.title} (${key})`);
      }
    });

    // Log what PRs were removed (for debugging, but don't notify about removals)
    const freshPRKeys = new Set(freshPRs.map((pr) => pr.id || pr.url));
    const removedPRs = oldPRs.filter((pr) => !freshPRKeys.has(pr.id || pr.url));
    if (removedPRs.length > 0) {
      this.debugService.log(
        `[PRService] PRs no longer present (${removedPRs.length}):`,
        removedPRs.map((pr) => pr.title)
      );
    }

    this.debugService.log(`[PRService] Comparison complete:`, {
      oldCount: oldPRs.length,
      freshCount: freshPRs.length,
      newCount: newPRs.length,
      removedCount: removedPRs.length,
      finalCount: allPRsWithStatus.length,
    });

    return { newPRs, allPRsWithStatus };
  }

  async getStoredAssignedPRs(): Promise<PullRequest[]> {
    const stored = await this.storageService.getStoredPRs(STORAGE_KEY_ASSIGNED_PRS);
    return stored?.prs || [];
  }

  /**
   * WHY [ordering + source of truth]: Invoked from `BackgroundManager.performInitialSetup`
   * before `EventService` handlers. Event handlers are heterogeneous; this step aligns the
   * toolbar badge with persisted state (`chrome.storage.local` assigned PRs, sync settings,
   * health flags) up front. Precedence matches fetch error handling: parser / outage flags
   * imply error badge; otherwise pending count respects `assigned.showDraftsInList`.
   */
  async syncBadgeFromStorage(): Promise<void> {
    const [parserBreakage, githubOutage] = await Promise.all([
      this.storageService.get(STORAGE_KEY_PARSER_BREAKAGE),
      this.storageService.get(STORAGE_KEY_GITHUB_OUTAGE),
    ]);

    if (parserBreakage != null || githubOutage != null) {
      await this.badgeService.setErrorBadge();
      return;
    }

    const [prs, settings] = await Promise.all([
      this.getStoredAssignedPRs(),
      this.storageService.getExtensionSettings(),
    ]);
    const pending = prs.filter((pr) => pr.reviewStatus !== 'reviewed');
    const count = filterPendingAssignedByDraftSetting(
      pending,
      settings.assigned.showDraftsInList
    ).length;
    await this.badgeService.setPRCountBadge(count);
  }

  async getStoredAuthoredPRs(): Promise<PullRequest[]> {
    const stored = await this.storageService.getStoredPRs(STORAGE_KEY_AUTHORED_PRS);
    this.debugService.log(`[PRService] Retrieved stored authored PRs: ${stored?.prs?.length ?? 0}`);
    return stored?.prs || [];
  }

  async getStoredMergedPRs(): Promise<PullRequest[]> {
    const stored = await this.storageService.getStoredPRs(STORAGE_KEY_MERGED_PRS);
    this.debugService.log(`[PRService] Retrieved stored merged PRs: ${stored?.prs?.length ?? 0}`);
    return stored?.prs || [];
  }

  async updateAuthoredPRs(forceRefresh = false, bypassCache = false): Promise<PullRequest[]> {
    while (true) {
      if (this.authoredFetchInProgress && this.authoredFetchOpts) {
        const o = this.authoredFetchOpts;
        const needStricter =
          (bypassCache && !o.bypassCache) || (forceRefresh && !o.forceRefresh);
        if (!needStricter) {
          this.debugService.log('[PRService] Authored fetch already in progress, reusing');
          return this.authoredFetchInProgress;
        }
        this.debugService.log(
          '[PRService] Authored fetch in progress with weaker flags; awaiting then retrying'
        );
        await this.authoredFetchInProgress;
        continue;
      }

      this.authoredFetchOpts = { forceRefresh, bypassCache };
      this.authoredFetchInProgress = this.doUpdateAuthoredPRs(forceRefresh, bypassCache)
        .finally(() => {
          this.authoredFetchInProgress = null;
          this.authoredFetchOpts = null;
        });
      return this.authoredFetchInProgress;
    }
  }

  private async doUpdateAuthoredPRs(forceRefresh: boolean, bypassCache: boolean): Promise<PullRequest[]> {
    this.debugService.log(`[PRService] Updating authored PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`);

    const stored = await this.storageService.getStoredPRs(STORAGE_KEY_AUTHORED_PRS);
    const oldPRs = stored?.prs || [];

    try {
      const isCacheValid =
        stored && stored.timestamp && Date.now() - stored.timestamp < CACHE_TTL_MS;

      if (isCacheValid && !forceRefresh && !bypassCache) {
        this.debugService.log('[PRService] Returning cached Authored PRs');
        return stored.prs;
      }

      const freshAuthoredPRsRaw = await this.gitHubService.fetchAuthoredPRs();
      this.debugService.log(
        `[PRService] Fetched ${freshAuthoredPRsRaw.length} authored PRs from GitHub`
      );

      const { accountSwap } = await this.detectAccountSwap('refreshing authored list baseline');

      const freshAuthoredPRs = accountSwap
        ? freshAuthoredPRsRaw.map((pr) => ({ ...pr, isNew: false }))
        : freshAuthoredPRsRaw;

      await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, freshAuthoredPRs);

      this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.healthStatusService.clearGitHubOutage();
      this.debugService.log(
        `[PRService] Successfully updated ${freshAuthoredPRs.length} authored PRs`
      );
      return freshAuthoredPRs;
    } catch (error) {
      if (error instanceof ParserBreakageError) {
        this.debugService.warn(
          `[PRService] ${error.message} — preserving ${oldPRs.length} stored authored PRs.`
        );
        await this.healthStatusService.signalParserBreakage(error.message);
        return oldPRs;
      }
      if (error instanceof GitHubOutageError) {
        this.debugService.warn(
          `[PRService] ${error.message} — preserving ${oldPRs.length} stored authored PRs.`
        );
        await this.healthStatusService.signalGitHubOutage(error.message);
        return oldPRs;
      }
      if (error instanceof RateLimitError) {
        this.rateLimitService.recordRateLimitHit(error.retryAfterSeconds);
      }
      this.debugService.error('[PRService] Error updating authored PRs:', error);
      throw error;
    }
  }

  /**
   * Fetches your merged PRs from GitHub, compares them to the stored list, persists updates,
   * and fires merged notifications for PRs that were not stored before (unless
   * {@link forceRefresh} is true).
   *
   * Uses the same **stricter-flags / wait-then-retry** coordination as
   * {@link fetchAndUpdateAssignedPRs} so a `bypassCache: true` alarm is not folded into an
   * in-flight weaker fetch that would return cached merged data.
   *
   * @param forceRefresh - Bypass cache and suppress merged notifications (manual refresh).
   * @param bypassCache - Ignore TTL cache and always refetch (periodic alarm).
   */
  async updateMergedPRs(forceRefresh = false, bypassCache = false): Promise<PullRequest[]> {
    while (true) {
      if (this.mergedFetchInProgress && this.mergedFetchOpts) {
        const o = this.mergedFetchOpts;
        const needStricter =
          (bypassCache && !o.bypassCache) || (forceRefresh && !o.forceRefresh);
        if (!needStricter) {
          this.debugService.log('[PRService] Merged fetch already in progress, reusing');
          return this.mergedFetchInProgress;
        }
        this.debugService.log(
          '[PRService] Merged fetch in progress with weaker flags; awaiting then retrying'
        );
        await this.mergedFetchInProgress;
        continue;
      }

      this.mergedFetchOpts = { forceRefresh, bypassCache };
      this.mergedFetchInProgress = this.doUpdateMergedPRs(forceRefresh, bypassCache).finally(() => {
        this.mergedFetchInProgress = null;
        this.mergedFetchOpts = null;
      });
      return this.mergedFetchInProgress;
    }
  }

  private async doUpdateMergedPRs(forceRefresh: boolean, bypassCache: boolean): Promise<PullRequest[]> {
    this.debugService.log(`[PRService] Updating merged PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`);

    const storedData = await this.storageService.getStoredPRs(STORAGE_KEY_MERGED_PRS);
    const oldPRs = storedData?.prs || [];

    try {
      const isCacheValid =
        storedData && storedData.timestamp && Date.now() - storedData.timestamp < CACHE_TTL_MS;

      if (isCacheValid && !forceRefresh && !bypassCache) {
        this.debugService.log('[PRService] Returning cached Merged PRs');
        return storedData.prs;
      }

      this.debugService.log(`[PRService] Current stored merged PRs count: ${oldPRs.length}`);

      const freshMergedPRs = await this.gitHubService.fetchMergedPRs();
      this.debugService.log(`[PRService] Fetched ${freshMergedPRs.length} merged PRs from GitHub`);

      const { accountSwap } = await this.detectAccountSwap('silent merged baseline');

      const oldMergedForCompare = accountSwap ? [] : oldPRs;

      let { newPRs, allPRsWithStatus: mergedPRsWithStatus } = this.comparePRs(
        oldMergedForCompare,
        freshMergedPRs
      );
      if (accountSwap) {
        newPRs = [];
        mergedPRsWithStatus = mergedPRsWithStatus.map((pr) => ({ ...pr, isNew: false }));
      }
      this.debugService.log(`[PRService] Newly merged PRs detected: ${newPRs.length}`);

      // WHY notify before persist: same rationale as persistAndNotifyAssigned.
      // If the worker dies after storage is written but before the notification
      // fires, the merged PR is permanently marked as "seen" with no alert.
      // Notifying first means the worst case is a duplicate on the next tick.
      if (newPRs.length > 0 && !forceRefresh) {
        this.debugService.log(
          `[PRService] Triggering merged PR notifications for ${newPRs.length} PR(s)`
        );
        await this.notificationService.showMergedPRNotifications(newPRs);
      } else if (newPRs.length === 0) {
        this.debugService.log('[PRService] No new merged PRs detected, skipping notifications');
      } else if (forceRefresh) {
        this.debugService.log('[PRService] Force refresh detected, skipping merged notifications');
      }

      await this.storageService.setStoredPRs(STORAGE_KEY_MERGED_PRS, mergedPRsWithStatus);

      this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.healthStatusService.clearGitHubOutage();
      this.debugService.log(`[PRService] Successfully updated ${mergedPRsWithStatus.length} merged PRs`);
      return mergedPRsWithStatus;
    } catch (error) {
      if (error instanceof ParserBreakageError) {
        this.debugService.warn(
          `[PRService] ${error.message} — preserving ${oldPRs.length} stored merged PRs.`
        );
        await this.healthStatusService.signalParserBreakage(error.message);
        return oldPRs;
      }
      if (error instanceof GitHubOutageError) {
        this.debugService.warn(
          `[PRService] ${error.message} — preserving ${oldPRs.length} stored merged PRs.`
        );
        await this.healthStatusService.signalGitHubOutage(error.message);
        return oldPRs;
      }
      if (error instanceof RateLimitError) {
        this.rateLimitService.recordRateLimitHit(error.retryAfterSeconds);
      }
      this.debugService.error('[PRService] Error updating merged PRs:', error);
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PRService] PR service disposed');
    this.initialized = false;
  }
}

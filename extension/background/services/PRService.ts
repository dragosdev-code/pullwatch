import type { IPRService } from '../interfaces/IPRService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IGitHubService } from '../interfaces/IGitHubService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IBadgeService } from '../interfaces/IBadgeService';
import type { IRateLimitService } from '../interfaces/IRateLimitService';
import type { IHealthStatusService } from '../interfaces/IHealthStatusService';
import type { IGitHubStatusClient } from '../interfaces/IGitHubStatusClient';
import type { PullRequest } from '@common/types';
import {
  CACHE_TTL_MS,
  REQUEST_DELAY_MS,
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_PARSER_BREAKAGE,
  STORAGE_KEY_ROUTE_HINT,
} from '@common/constants';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { delay } from '@common/utils';
import {
  comparePullRequestLists,
  filterPendingAssignedByDraftSetting,
  getPrKey,
  mergeAndFilterAssignedPRs,
} from '@background/utils/pull-request-list-utils';
import {
  MergedLimboPromoter,
  MergedNotificationEligibility,
  PrListTrustAssessor,
  PrListTrustStore,
} from '@background/domain/pr-list-trust';
import { PrFetchErrorHandler } from '@background/domain/PrFetchErrorHandler';

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
  private gitHubStatusClient: IGitHubStatusClient;
  private trustAssessor: PrListTrustAssessor;
  private limboPromoter: MergedLimboPromoter;
  private mergedNotificationEligibility: MergedNotificationEligibility;
  private fetchErrorHandler: PrFetchErrorHandler;
  private initialized = false;
  /**
   * One entry per list (assigned / merged / authored) while its fetch is in flight.
   *
   * WHY [shared slot]: {@link withInflightDedup} uses this to dedupe concurrent callers for the
   * same list and to decide whether to wait-and-retry when a later caller needs stricter flags
   * (e.g. the alarm's `bypassCache: true` must not fold into a weaker popup fetch).
   */
  private inflightFetches = new Map<
    'assigned' | 'merged' | 'authored',
    { promise: Promise<PullRequest[]>; opts: { forceRefresh: boolean; bypassCache: boolean } }
  >();
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
    gitHubStatusClient: IGitHubStatusClient;
  }) {
    this.debugService = deps.debugService;
    this.storageService = deps.storageService;
    this.gitHubService = deps.gitHubService;
    this.notificationService = deps.notificationService;
    this.badgeService = deps.badgeService;
    this.rateLimitService = deps.rateLimitService;
    this.healthStatusService = deps.healthStatusService;
    this.gitHubStatusClient = deps.gitHubStatusClient;
    const trustStore = new PrListTrustStore(this.storageService, this.debugService);
    this.trustAssessor = new PrListTrustAssessor(this.gitHubStatusClient);
    this.limboPromoter = new MergedLimboPromoter(trustStore);
    this.mergedNotificationEligibility = new MergedNotificationEligibility(this.debugService);
    this.fetchErrorHandler = new PrFetchErrorHandler(
      this.debugService,
      this.badgeService,
      this.healthStatusService,
      this.rateLimitService
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[PRService] PR service initialized');
  }

  /**
   * WHY [ordering]: Writes `github_viewer_identity` from {@link IGitHubService.getLastResolvedViewerLogin}
   * and resets in-memory swap state ({@link resetSwapCycleState}).
   *
   * **Call sites:** {@link EventService.withPrUiFetchIndicator} when overlapping fetches drain to
   * depth 0 (parallel manual refresh + alarm’s single sequential block); {@link EventService.handleInstallation}
   * and {@link EventService.handleStartup} after assigned-only fetch. Those entry points keep storage
   * identity stable until every list path in a refresh wave has run swap detection against the same baseline.
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
   *
   * WHY [storage baseline]: Baseline is frozen on the first {@link getCycleBaselineLogin} call this cycle
   * (backed by {@link IStorageService.getGitHubViewerIdentity}). Parallel manual refresh relies on
   * {@link EventService.withPrUiFetchIndicator}
   * to delay {@link persistResolvedViewerIdentity} until all three fetches finish so that read stays
   * the **pre-refresh** login for assigned, merged, and authored.
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
  async fetchAndUpdateAssignedPRs(
    forceRefresh = false,
    bypassCache = false
  ): Promise<PullRequest[]> {
    return this.withInflightDedup('assigned', { forceRefresh, bypassCache }, 'Assigned', () =>
      this.doFetchAndUpdateAssignedPRs(forceRefresh, bypassCache)
    );
  }

  /**
   * WHY [single gate]: Assigned, merged, and authored share one TTL on the `StoredPRs` envelope
   * (`lastUpdated` surfaced as `timestamp` by {@link IStorageService.getStoredPRs}). Callers pass
   * the same object they already read for `oldPRs` so we never add an extra `chrome.storage` round
   * trip. `bypassCache: true` is how {@link EventService.handleAlarm} forces a GitHub hit every tick;
   * `forceRefresh` is install/startup/manual refresh — both must skip this fast path so notification
   * baselines and {@link BackgroundManager.performInitialSetup} semantics stay correct.
   */
  private tryTtlCachedPrList(
    stored: { prs: PullRequest[]; timestamp?: number } | null,
    forceRefresh: boolean,
    bypassCache: boolean,
    listLabelForLog: 'Assigned' | 'Merged' | 'Authored'
  ): PullRequest[] | null {
    const isCacheValid = stored && stored.timestamp && Date.now() - stored.timestamp < CACHE_TTL_MS;

    if (isCacheValid && !forceRefresh && !bypassCache) {
      this.debugService.log(`[PRService] Returning cached ${listLabelForLog} PRs`);
      return stored.prs;
    }
    return null;
  }

  /**
   * Coalesces overlapping fetches for one list. If an earlier fetch is in flight with at least the
   * flags the new caller asks for, reuse its promise. If the new caller needs **stricter** flags
   * (e.g. alarm's `bypassCache: true` while the popup started with cache allowed), wait for the
   * weaker run to finish and start a fresh one — never attach a cache-only result to a caller that
   * must hit GitHub.
   */
  private async withInflightDedup(
    slot: 'assigned' | 'merged' | 'authored',
    opts: { forceRefresh: boolean; bypassCache: boolean },
    logLabel: 'Assigned' | 'Merged' | 'Authored',
    work: () => Promise<PullRequest[]>
  ): Promise<PullRequest[]> {
    while (true) {
      const existing = this.inflightFetches.get(slot);
      if (existing) {
        const o = existing.opts;
        const needStricter =
          (opts.bypassCache && !o.bypassCache) || (opts.forceRefresh && !o.forceRefresh);
        if (!needStricter) {
          this.debugService.log(`[PRService] ${logLabel} fetch already in progress, reusing`);
          return existing.promise;
        }
        this.debugService.log(
          `[PRService] ${logLabel} fetch in progress with weaker flags; awaiting then retrying`
        );
        await existing.promise;
        continue;
      }

      const promise = work().finally(() => {
        this.inflightFetches.delete(slot);
      });
      this.inflightFetches.set(slot, { promise, opts });
      return promise;
    }
  }

  /**
   * WHY [outage-gate]: When the gate fires we suppress PR-array persistence too — not just the
   * notification. Persisting an empty shell would poison `oldPRs` for the next tick and recreate
   * the storm once GitHub recovers (`comparePRs` would treat every restored PR as new). We persist
   * only metadata (`STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT` + the outage flag) so the popup can render
   * "we did check, but didn't trust the result" without losing the last-known-good list.
   *
   * If you change this, also check {@link persistAndNotifyAssigned} (the happy-path notify-before-
   * persist invariant) and {@link HealthStatusService.signalGitHubOutage} (single-flag dedupe so
   * we keep one banner, not two).
   */
  private async persistUntrustedFetchMetadata(context: string): Promise<void> {
    await chromeExtensionService.storage.local.set({
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: Date.now(),
    });
    await this.healthStatusService.signalGitHubOutage(context, 'pr_component_degraded');
  }

  private async doFetchAndUpdateAssignedPRs(
    forceRefresh: boolean,
    bypassCache: boolean
  ): Promise<PullRequest[]> {
    this.debugService.log(
      `[PRService] Fetching and updating assigned PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`
    );

    const storedData = await this.storageService.getStoredPRs(STORAGE_KEY_ASSIGNED_PRS);
    const oldPRs = storedData?.prs || [];

    try {
      const cached = this.tryTtlCachedPrList(storedData, forceRefresh, bypassCache, 'Assigned');
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

      const assignedTrust = await this.trustAssessor.assess(
        oldPRs,
        [...freshPendingPRsRaw, ...freshReviewedPRsRaw]
      );
      if (assignedTrust.suspicious) {
        this.debugService.warn(
          `[PRService] Trust gate: suspicious assigned fetch (${assignedTrust.reasons.join(', ')}) — preserving ${oldPRs.length} stored PRs.`
        );
        await this.limboPromoter.recordSuspiciousFetch(
          'assigned',
          assignedTrust.reasons,
          oldPRs,
          [...freshPendingPRsRaw, ...freshReviewedPRsRaw]
        );
        await this.persistUntrustedFetchMetadata(
          `Suspicious assigned list: ${assignedTrust.reasons.join(', ')}`
        );
        return oldPRs;
      }

      if (!accountSwap) {
        ({ accountSwap } = await this.detectAccountSwap('silent assigned baseline'));
      }

      const oldPendingForCompare = accountSwap ? [] : oldPendingPRs;

      let { allPRs, filteredPending, newPRs } = mergeAndFilterAssignedPRs(
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
      await this.limboPromoter.recordTrustedFetch('assigned', allPRs.length);

      this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.healthStatusService.clearGitHubOutage();
      this.debugService.log(`[PRService] Successfully updated ${allPRs.length} PRs`);
      return allPRs;
    } catch (error) {
      // WHY [updateBadgeOnError: true]: Assigned owns the toolbar count; outage / parser / transport
      // failures must paint the error badge so the icon matches the stale list we hand back.
      return this.fetchErrorHandler.handle(error, {
        listKind: 'assigned',
        oldPRs,
        updateBadgeOnError: true,
        transportErrorLabel: 'Error fetching and updating PRs',
      });
    }
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
    const { newPRs, allPRsWithStatus, removedPRs } = comparePullRequestLists(oldPRs, freshPRs);

    for (const pr of newPRs) {
      this.debugService.log(`[PRService] New PR detected: ${pr.title} (${getPrKey(pr)})`);
    }
    for (const pr of allPRsWithStatus.filter((pr) => !pr.isNew)) {
      this.debugService.log(`[PRService] Existing PR: ${pr.title} (${getPrKey(pr)})`);
    }

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
    return this.withInflightDedup('authored', { forceRefresh, bypassCache }, 'Authored', () =>
      this.doUpdateAuthoredPRs(forceRefresh, bypassCache)
    );
  }

  private async doUpdateAuthoredPRs(
    forceRefresh: boolean,
    bypassCache: boolean
  ): Promise<PullRequest[]> {
    this.debugService.log(
      `[PRService] Updating authored PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`
    );

    const stored = await this.storageService.getStoredPRs(STORAGE_KEY_AUTHORED_PRS);
    const oldPRs = stored?.prs || [];

    try {
      const cached = this.tryTtlCachedPrList(stored, forceRefresh, bypassCache, 'Authored');
      if (cached) return cached;

      const freshAuthoredPRsRaw = await this.gitHubService.fetchAuthoredPRs();
      this.debugService.log(
        `[PRService] Fetched ${freshAuthoredPRsRaw.length} authored PRs from GitHub`
      );

      const authoredTrust = await this.trustAssessor.assess(oldPRs, freshAuthoredPRsRaw);
      if (authoredTrust.suspicious) {
        this.debugService.warn(
          `[PRService] Trust gate: suspicious authored fetch (${authoredTrust.reasons.join(', ')}) — preserving ${oldPRs.length} stored authored PRs.`
        );
        await this.limboPromoter.recordSuspiciousFetch(
          'authored',
          authoredTrust.reasons,
          oldPRs,
          freshAuthoredPRsRaw
        );
        await this.persistUntrustedFetchMetadata(
          `Suspicious authored list: ${authoredTrust.reasons.join(', ')}`
        );
        return oldPRs;
      }

      const { accountSwap } = await this.detectAccountSwap('refreshing authored list baseline');

      const freshAuthoredPRs = accountSwap
        ? freshAuthoredPRsRaw.map((pr) => ({ ...pr, isNew: false }))
        : freshAuthoredPRsRaw;

      await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, freshAuthoredPRs);
      await this.limboPromoter.recordTrustedFetch('authored', freshAuthoredPRs.length);

      this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.healthStatusService.clearGitHubOutage();
      this.debugService.log(
        `[PRService] Successfully updated ${freshAuthoredPRs.length} authored PRs`
      );
      return freshAuthoredPRs;
    } catch (error) {
      // WHY [updateBadgeOnError: false]: Authored is a secondary list — its failures must not
      // blow away a healthy assigned badge count.
      return this.fetchErrorHandler.handle(error, {
        listKind: 'authored',
        oldPRs,
        updateBadgeOnError: false,
        transportErrorLabel: 'Error updating authored PRs',
      });
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
    return this.withInflightDedup('merged', { forceRefresh, bypassCache }, 'Merged', () =>
      this.doUpdateMergedPRs(forceRefresh, bypassCache)
    );
  }

  private async doUpdateMergedPRs(
    forceRefresh: boolean,
    bypassCache: boolean
  ): Promise<PullRequest[]> {
    this.debugService.log(
      `[PRService] Updating merged PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`
    );

    const storedData = await this.storageService.getStoredPRs(STORAGE_KEY_MERGED_PRS);
    const oldPRs = storedData?.prs || [];

    try {
      const cached = this.tryTtlCachedPrList(storedData, forceRefresh, bypassCache, 'Merged');
      if (cached) return cached;

      this.debugService.log(`[PRService] Current stored merged PRs count: ${oldPRs.length}`);

      const freshMergedPRs = await this.gitHubService.fetchMergedPRs();
      this.debugService.log(`[PRService] Fetched ${freshMergedPRs.length} merged PRs from GitHub`);

      const mergedTrust = await this.trustAssessor.assess(oldPRs, freshMergedPRs);
      if (mergedTrust.suspicious) {
        this.debugService.warn(
          `[PRService] Trust gate: suspicious merged fetch (${mergedTrust.reasons.join(', ')}) — preserving ${oldPRs.length} stored merged PRs.`
        );
        await this.limboPromoter.recordSuspiciousFetch(
          'merged',
          mergedTrust.reasons,
          oldPRs,
          freshMergedPRs
        );
        await this.persistUntrustedFetchMetadata(
          `Suspicious merged list: ${mergedTrust.reasons.join(', ')}`
        );
        return oldPRs;
      }

      const { accountSwap } = await this.detectAccountSwap('silent merged baseline');

      const trustedMergedPRs = await this.limboPromoter.promoteTrustedMergedList(
        oldPRs,
        freshMergedPRs,
        mergedTrust.missConfirmationsRequired
      );

      const oldMergedForCompare = accountSwap ? [] : oldPRs;

      let { newPRs, allPRsWithStatus: mergedPRsWithStatus } = this.comparePRs(
        oldMergedForCompare,
        trustedMergedPRs
      );
      if (accountSwap) {
        newPRs = [];
        mergedPRsWithStatus = mergedPRsWithStatus.map((pr) => ({ ...pr, isNew: false }));
      }
      newPRs = this.mergedNotificationEligibility.filterFreshCandidates(
        newPRs,
        storedData?.timestamp,
        mergedTrust.status
      );
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
      this.debugService.log(
        `[PRService] Successfully updated ${mergedPRsWithStatus.length} merged PRs`
      );
      return mergedPRsWithStatus;
    } catch (error) {
      // WHY [updateBadgeOnError: false]: Merged is a secondary list — its failures must not
      // blow away a healthy assigned badge count.
      return this.fetchErrorHandler.handle(error, {
        listKind: 'merged',
        oldPRs,
        updateBadgeOnError: false,
        transportErrorLabel: 'Error updating merged PRs',
      });
    }
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PRService] PR service disposed');
    this.initialized = false;
  }
}

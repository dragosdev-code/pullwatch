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
  MERGED_SHRINK_SUSPICION_THRESHOLD,
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
  getMissingPRs,
  getPrKey,
  mergeAndFilterAssignedPRs,
} from '@background/utils/pull-request-list-utils';
import {
  AlarmSeqClock,
  EmptyConfirmationTracker,
  type ListKind,
  type ListTrustAssessment,
  MergedLimboPromoter,
  MergedNotificationEligibility,
  PrListTrustAssessor,
  PrListTrustStore,
  PrTombstoneStore,
} from '@background/domain/pr-list-trust';
import type { GitHubStatusSnapshot } from '@background/interfaces/IGitHubStatusClient';
import { PrFetchErrorHandler } from '@background/domain/PrFetchErrorHandler';
import { GITHUB_ORIGIN_PATTERN, type SiteAccessProbe } from '@common/site-access-classifier';

/**
 * Backs {@link SiteAccessProbe} with `chrome.permissions.contains` via the shared adapter. Lives
 * inline because it is the only consumer; lifting it into a separate module would only add an
 * indirection without a second call site.
 */
const chromeSiteAccessProbe: SiteAccessProbe = {
  hasGitHubOrigin: () =>
    chromeExtensionService.permissions.contains({ origins: [GITHUB_ORIGIN_PATTERN] }),
};

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
  private trustStore: PrListTrustStore;
  private trustAssessor: PrListTrustAssessor;
  private limboPromoter: MergedLimboPromoter;
  private emptyTracker: EmptyConfirmationTracker;
  private mergedNotificationEligibility: MergedNotificationEligibility;
  private fetchErrorHandler: PrFetchErrorHandler;
  private tombstoneStore: PrTombstoneStore;
  private alarmSeqClock: AlarmSeqClock;
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
  /**
   * Last non-null viewer login resolved during the current wave. One wave = one browser session,
   * but a page variant can parse no viewer login (and authored's last bucket often does). Holding
   * the last non-null value keeps swap detection / refresh markers / identity persist on the same
   * account even when an individual fetch's HTML yields no login. See {@link resolveCycleLogin}.
   */
  private cycleResolvedLogin: string | null = null;
  private clearedRouteHintForSwapKey: string | null = null;
  /**
   * Viewer login observed when each PR list was successfully written during the current wave.
   * Used by {@link persistResolvedViewerIdentity} to distinguish "refreshed for the final viewer"
   * from "refreshed before the browser session crossed accounts".
   */
  private cycleListRefreshLogins = new Map<'assigned' | 'merged' | 'authored', string | null>();
  /**
   * Set when {@link applyTombstoneFilter} signals `pr_list_churn` for this wave; blocks routine
   * `clearGitHubOutage` calls on **every** list until {@link beginPrListHealthWave} runs again so
   * merged/authored success cannot erase the integrity flag set by assigned (same alarm tick).
   */
  private suppressGitHubOutageClearForListChurnWave = false;

  constructor(deps: {
    debugService: IDebugService;
    storageService: IStorageService;
    gitHubService: IGitHubService;
    notificationService: INotificationService;
    badgeService: IBadgeService;
    rateLimitService: IRateLimitService;
    healthStatusService: IHealthStatusService;
    gitHubStatusClient: IGitHubStatusClient;
    alarmSeqClock: AlarmSeqClock;
  }) {
    this.debugService = deps.debugService;
    this.storageService = deps.storageService;
    this.gitHubService = deps.gitHubService;
    this.notificationService = deps.notificationService;
    this.badgeService = deps.badgeService;
    this.rateLimitService = deps.rateLimitService;
    this.healthStatusService = deps.healthStatusService;
    this.gitHubStatusClient = deps.gitHubStatusClient;
    this.alarmSeqClock = deps.alarmSeqClock;
    this.trustStore = new PrListTrustStore(this.storageService, this.debugService);
    this.trustAssessor = new PrListTrustAssessor(this.gitHubStatusClient);
    this.limboPromoter = new MergedLimboPromoter(this.trustStore);
    this.emptyTracker = new EmptyConfirmationTracker(this.trustStore, this.debugService);
    this.mergedNotificationEligibility = new MergedNotificationEligibility(this.debugService);
    this.tombstoneStore = new PrTombstoneStore(this.storageService, this.debugService);
    this.fetchErrorHandler = new PrFetchErrorHandler(
      this.debugService,
      this.badgeService,
      this.healthStatusService,
      this.rateLimitService,
      chromeSiteAccessProbe
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[PRService] PR service initialized');
  }

  beginPrListHealthWave(): void {
    this.suppressGitHubOutageClearForListChurnWave = false;
  }

  private async maybeClearGitHubOutageAfterListSuccess(): Promise<void> {
    if (this.suppressGitHubOutageClearForListChurnWave) return;
    await this.healthStatusService.clearGitHubOutage();
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
      const login = this.resolveCycleLogin();
      if (!login) {
        this.debugService.log('[PRService] Skipping viewer identity persist — no resolved login');
        return;
      }

      // WHY [swap + partial refresh]: A wave can advance the viewer identity after only some
      // list writes completed. Clear lists that did not write for the final resolved login so
      // storage never pairs `github_viewer_identity` with another account's PR arrays.
      const baselineLogin = await this.getCycleBaselineLogin();
      if (baselineLogin && baselineLogin !== login) {
        await this.clearUnrefreshedListsAfterSwap(baselineLogin, login);
      }

      await this.storageService.setGitHubViewerIdentity({
        login,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.resetSwapCycleState();
    }
  }

  private async clearUnrefreshedListsAfterSwap(
    baselineLogin: string,
    currentLogin: string
  ): Promise<void> {
    const lists: ReadonlyArray<{
      kind: 'assigned' | 'merged' | 'authored';
      key:
        | typeof STORAGE_KEY_ASSIGNED_PRS
        | typeof STORAGE_KEY_MERGED_PRS
        | typeof STORAGE_KEY_AUTHORED_PRS;
    }> = [
      { kind: 'assigned', key: STORAGE_KEY_ASSIGNED_PRS },
      { kind: 'merged', key: STORAGE_KEY_MERGED_PRS },
      { kind: 'authored', key: STORAGE_KEY_AUTHORED_PRS },
    ];
    for (const { kind, key } of lists) {
      const didRefresh = this.cycleListRefreshLogins.has(kind);
      const refreshLogin = this.cycleListRefreshLogins.get(kind);
      if (refreshLogin === currentLogin) continue;
      const refreshState = didRefresh
        ? `refreshed for ${refreshLogin ?? 'no resolved login'}`
        : 'did not refresh';
      this.debugService.warn(
        `[PRService] Account swap (${baselineLogin} → ${currentLogin}) but ${kind} list ${refreshState}; clearing stale storage to avoid cross-account data leak.`
      );
      await this.storageService.setStoredPRs(key, []);
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

  /**
   * WHY [sticky resolved login]: {@link IGitHubService.getLastResolvedViewerLogin} is reset to null
   * at the start of every `fetchPRs` and only set when a page yields a parseable viewer login.
   * Authored fetches four sequential buckets, so the raw value reflects only the last bucket —
   * frequently an empty/headerless page that resolves null. Caching the last non-null login for the
   * cycle keeps {@link detectAccountSwap}, {@link markListRefreshedForCurrentViewer}, and
   * {@link persistResolvedViewerIdentity} agreeing on the wave's single account.
   */
  private resolveCycleLogin(): string | null {
    const live = this.gitHubService.getLastResolvedViewerLogin();
    if (live) this.cycleResolvedLogin = live;
    return this.cycleResolvedLogin;
  }

  private resetSwapCycleState(): void {
    this.cycleBaselineLoaded = false;
    this.cycleBaselineLogin = null;
    this.cycleResolvedLogin = null;
    this.clearedRouteHintForSwapKey = null;
    this.cycleListRefreshLogins.clear();
  }

  /** WHY [write provenance]: a successful list write only counts for swap cleanup if it belongs to the final viewer. */
  private markListRefreshedForCurrentViewer(kind: 'assigned' | 'merged' | 'authored'): void {
    this.cycleListRefreshLogins.set(kind, this.cycleResolvedLogin);
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
    const currentLogin = this.resolveCycleLogin();
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
   * WHY: When `github_viewer_identity` already matches the live session, {@link detectAccountSwap}
   * is false but `github_merged_prs` can still hold another account's rows. A full URL-key
   * turnover with every stored row's primary author ≠ the resolved viewer is not the same
   * truncation risk as {@link MERGED_SHRINK_SUSPICION_THRESHOLD} (same-account merges vanishing).
   * Requires a non-empty fresh list so empty-fetch / empty-confirm paths stay unchanged.
   */
  private isImplicitStaleMergedBaseline(
    oldPRs: PullRequest[],
    freshPRs: PullRequest[],
    currentLogin: string | null,
    accountSwap: boolean
  ): boolean {
    if (accountSwap || !currentLogin || oldPRs.length === 0 || freshPRs.length === 0) return false;
    if (getMissingPRs(oldPRs, freshPRs).length !== oldPRs.length) return false;
    for (const pr of oldPRs) {
      const login = pr.author?.[0]?.login;
      if (!login || login === currentLogin) return false;
    }
    return true;
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
    bypassCache = false,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]> {
    return this.withInflightDedup('assigned', { forceRefresh, bypassCache }, 'Assigned', () =>
      this.doFetchAndUpdateAssignedPRs(forceRefresh, bypassCache, waveStatus)
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
   * If you change this, also check {@link persistAndNotifyAssigned} (the happy-path
   * visual → persist → sound ordering invariant) and {@link HealthStatusService.signalGitHubOutage}
   * (single-flag dedupe so we keep one banner, not two).
   */
  private async persistUntrustedFetchMetadata(context: string): Promise<void> {
    await chromeExtensionService.storage.local.set({
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: Date.now(),
    });
    await this.healthStatusService.signalGitHubOutage(context, 'pr_component_degraded');
  }

  /**
   * Dispatches a `ListTrustAssessment` into one of six branches. Callers must
   * have already filtered out the account-swap case via
   * {@link detectAccountSwap}; the dispatcher does NOT re-check identity.
   *
   * Branches:
   * - `trusted`: caller runs the existing happy path (compare/persist/notify).
   * - `trusted_operational_shrink`: same downstream behavior as `trusted` — the assessor flagged
   *   `suspect_partial` with `partialDropFlavor === 'operational'` on assigned/authored (or merged
   *   with a sub-threshold shrink). UX freshness wins over hypothetical truncation; tombstones
   *   still record the dropped keys downstream so flapping is detected post-hoc.
   * - `suspect_partial`: caller runs the existing limbo + corroborated outage path.
   * - `suspect_empty_pending`: silent — caller returns oldPRs without touching
   *   `healthStatusService` or `STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT`.
   * - `suspect_empty_accept`: streak hit threshold — caller persists `[]` and
   *   sets `recoveryBaseline = 'accepted_empty'` on the bucket so the next
   *   trusted non-empty fetch routes through `markAsExistingBaseline`.
   * - `suspect_empty_corroborated`: Statuspage corroborates — caller runs the
   *   existing limbo + corroborated outage path.
   * - `suspect_empty_reset_swap`: tracker observed identity mismatch the swap
   *   pre-empt missed — caller treats fresh as a new baseline (parallel to
   *   account-swap), NO outage signal.
   */
  private async dispatchPrListAssessment(args: {
    listKind: ListKind;
    assessment: ListTrustAssessment;
    oldCount: number;
    currentLogin: string | null;
  }): Promise<
    | { branch: 'trusted' }
    | { branch: 'trusted_operational_shrink' }
    | { branch: 'suspect_partial' }
    | { branch: 'suspect_empty_pending'; streak: number; threshold: number }
    | { branch: 'suspect_empty_accept'; streak: number; threshold: number }
    | { branch: 'suspect_empty_corroborated' }
    | { branch: 'suspect_empty_reset_swap' }
  > {
    const { listKind, assessment, oldCount, currentLogin } = args;
    if (assessment.kind === 'trusted') return { branch: 'trusted' };
    if (assessment.kind === 'suspect_partial') {
      // WHY [trust-split]: assigned/authored bulk shrink (e.g. sprint-end merge wave taking 10→4)
      // is operational churn — leaving the popup stuck on `oldPRs` until limbo eventually promotes
      // is worse than persisting the fresh shorter list. Merged is append-heavy; losing
      // >= MERGED_SHRINK_SUSPICION_THRESHOLD rows in a single tick is the GitHub-side
      // incompleteness pattern, not legitimate churn, so it stays on the suspicious path.
      const isOperational = assessment.partialDropFlavor === 'operational';
      if (isOperational) {
        if (listKind !== 'merged') {
          return { branch: 'trusted_operational_shrink' };
        }
        const missing = assessment.missingCount ?? 0;
        if (missing < MERGED_SHRINK_SUSPICION_THRESHOLD) {
          return { branch: 'trusted_operational_shrink' };
        }
      }
      return { branch: 'suspect_partial' };
    }

    const outcome = await this.emptyTracker.observeEmpty({
      listKind,
      oldCount,
      currentLogin,
      status: assessment.status,
    });
    switch (outcome.kind) {
      case 'pending':
        return {
          branch: 'suspect_empty_pending',
          streak: outcome.streak,
          threshold: outcome.threshold,
        };
      case 'accept':
        return {
          branch: 'suspect_empty_accept',
          streak: outcome.streak,
          threshold: outcome.threshold,
        };
      case 'corroborated':
        return { branch: 'suspect_empty_corroborated' };
      case 'reset_swap':
        return { branch: 'suspect_empty_reset_swap' };
    }
  }

  /**
   * One-shot recovery hint set by the AcceptedEmpty transition; consumed by
   * the next trusted non-empty fetch in the corresponding `do*` method.
   *
   * WHY [markAsExistingBaseline parity]: Without consuming this marker, the
   * trusted branch would call `comparePullRequestLists([], fresh)` and treat
   * every returning PR as new — fanning out a notification storm. Consuming
   * the marker switches the per-list path to the same `markAsExistingBaseline`
   * shape used by the account-swap branch.
   */
  private async markRecoveryBaseline(listKind: ListKind): Promise<void> {
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind] ?? {};
    lists[listKind] = { ...current, recoveryBaseline: 'accepted_empty' };
    await this.trustStore.write({ ...state, lists });
  }

  private async clearRecoveryBaseline(listKind: ListKind): Promise<void> {
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind];
    if (!current?.recoveryBaseline) return;
    const cleared = { ...current };
    delete cleared.recoveryBaseline;
    lists[listKind] = cleared;
    await this.trustStore.write({ ...state, lists });
  }

  /** Clears and returns whether `recoveryBaseline` was set; call only when `fresh.length > 0`. */
  private async consumeRecoveryBaseline(listKind: ListKind): Promise<boolean> {
    const state = await this.trustStore.read();
    const present = state.lists?.[listKind]?.recoveryBaseline === 'accepted_empty';
    if (present) await this.clearRecoveryBaseline(listKind);
    return present;
  }

  private async doFetchAndUpdateAssignedPRs(
    forceRefresh: boolean,
    bypassCache: boolean,
    waveStatus?: GitHubStatusSnapshot
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
      if (!accountSwap) {
        ({ accountSwap } = await this.detectAccountSwap('silent assigned baseline'));
      }

      const freshAssignedPRsRaw = [...freshPendingPRsRaw, ...freshReviewedPRsRaw];
      if (!accountSwap) {
        const assignedTrust = await this.trustAssessor.assess(
          oldPRs,
          freshAssignedPRsRaw,
          waveStatus
        );
        const dispatch = await this.dispatchPrListAssessment({
          listKind: 'assigned',
          assessment: assignedTrust,
          oldCount: oldPRs.length,
          currentLogin: this.gitHubService.getLastResolvedViewerLogin(),
        });
        switch (dispatch.branch) {
          case 'suspect_partial': {
            this.debugService.warn(
              `[PRService] Trust gate: partial-drop assigned fetch (${assignedTrust.reasons.join(', ')}) — preserving ${oldPRs.length} stored PRs.`
            );
            await this.limboPromoter.recordSuspiciousFetch(
              'assigned',
              assignedTrust.reasons,
              oldPRs,
              freshAssignedPRsRaw
            );
            await this.persistUntrustedFetchMetadata(
              `Suspicious assigned list: ${assignedTrust.reasons.join(', ')}`
            );
            return oldPRs;
          }
          case 'suspect_empty_pending': {
            // WHY [silent]: legitimate "I cleared my queue" is the dominant case
            // for a non-empty → empty assigned transition. We carry oldPRs forward
            // until N consecutive confirmations promote the empty to AcceptedEmpty.
            // No outage signal, no LAST_UNTRUSTED_FETCH_AT write, no banner.
            this.debugService.log(
              `[PRService] assigned empty pending confirmation (streak=${dispatch.streak}/${dispatch.threshold})`
            );
            return oldPRs;
          }
          case 'suspect_empty_accept': {
            this.debugService.log(
              `[PRService] assigned empty accepted after ${dispatch.streak} confirmations — persisting [].`
            );
            await this.persistAndNotifyAssigned([], 0, [], forceRefresh);
            await this.markRecoveryBaseline('assigned');
            await this.limboPromoter.recordTrustedFetch('assigned', 0);
            await this.rateLimitService.recordSuccess();
            await this.healthStatusService.clearParserBreakage();
            await this.maybeClearGitHubOutageAfterListSuccess();
            return [];
          }
          case 'suspect_empty_corroborated': {
            this.debugService.warn(
              `[PRService] Trust gate: empty assigned fetch corroborated by Statuspage — preserving ${oldPRs.length} stored PRs.`
            );
            await this.limboPromoter.recordSuspiciousFetch(
              'assigned',
              [...assignedTrust.reasons, 'corroborated_by_statuspage'],
              oldPRs,
              freshAssignedPRsRaw
            );
            await this.persistUntrustedFetchMetadata(
              `Suspicious assigned list (corroborated): ${assignedTrust.reasons.join(', ')}`
            );
            return oldPRs;
          }
          case 'suspect_empty_reset_swap': {
            // WHY [parallel to swap]: tracker observed identity mismatch the
            // detectAccountSwap pre-empt missed. Treat fresh as a new baseline,
            // NO outage signal — identity change is not an outage.
            this.debugService.log(
              '[PRService] assigned empty under identity mismatch; trusting fresh as baseline.'
            );
            await this.persistAndNotifyAssigned([], 0, [], forceRefresh);
            await this.limboPromoter.recordTrustedFetch('assigned', 0);
            await this.rateLimitService.recordSuccess();
            await this.healthStatusService.clearParserBreakage();
            await this.maybeClearGitHubOutageAfterListSuccess();
            return [];
          }
          case 'trusted_operational_shrink':
            this.debugService.log(
              `[PRService] assigned operational shrink (${assignedTrust.reasons.join(', ')}) — persisting fresh list.`
            );
            break;
          case 'trusted':
            break;
        }
      } else {
        this.debugService.log(
          '[PRService] Account swap detected for assigned PRs; trusting fresh list as new baseline.'
        );
        // WHY [parity with reset_swap]: a swap detected at the dispatcher level
        // also clears any in-flight empty streak so a subsequent legitimate-zero
        // streak under the new identity starts fresh.
        await this.emptyTracker.clear('assigned');
      }

      // WHY [recovery consumption]: if the previous cycle's AcceptedEmpty wrote
      // [] and armed the marker, route the next non-empty fetch through
      // markAsExistingBaseline (same shape as account swap) so returning PRs
      // are not classified as new. Empty trusted ticks after accept must NOT
      // consume the marker (would defeat suppression after intermittent [] polls).
      const recoveryBaseline =
        !accountSwap &&
        freshAssignedPRsRaw.length > 0 &&
        (await this.consumeRecoveryBaseline('assigned'));
      const treatAsBaseline = accountSwap || recoveryBaseline;
      const oldPendingForCompare = treatAsBaseline ? [] : oldPendingPRs;

      const assignedMerge = mergeAndFilterAssignedPRs(
        oldPendingForCompare,
        freshPendingPRsRaw,
        freshReviewedPRsRaw,
        showDrafts
      );
      let { allPRs, filteredPending, newPRs } = assignedMerge;
      const { clientFilteredDraftKeys } = assignedMerge;

      if (treatAsBaseline) {
        newPRs = [];
        allPRs = allPRs.map((pr) => ({ ...pr, isNew: false }));
        filteredPending = filterPendingAssignedByDraftSetting(
          allPRs.filter((pr) => pr.reviewStatus !== 'reviewed'),
          showDrafts
        );
      } else {
        // WHY [skip on baseline branches]: account-swap and recovery-baseline already squash newPRs
        // and isNew flags as part of treating fresh as a new baseline; running tombstone filtering
        // there would also tombstone keys absent from the synthetic empty oldPendingForCompare,
        // wiping the log on every swap.
        ({ newPRs, allPRsWithStatus: allPRs } = await this.applyTombstoneFilter({
          listKind: 'assigned',
          oldPRs,
          freshList: allPRs,
          newPRs,
          allPRsWithStatus: allPRs,
          dropIgnoredKeys: clientFilteredDraftKeys,
        }));
        filteredPending = filterPendingAssignedByDraftSetting(
          allPRs.filter((pr) => pr.reviewStatus !== 'reviewed'),
          showDrafts
        );
      }

      await this.persistAndNotifyAssigned(allPRs, filteredPending.length, newPRs, forceRefresh);
      await this.limboPromoter.recordTrustedFetch('assigned', allPRs.length);

      await this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.maybeClearGitHubOutageAfterListSuccess();
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
   * Fires visual notifications for new assigned PRs, then persists the full list, then plays
   * the sound. Updates the badge between persist and sound.
   *
   * WHY [visual → persist → sound ordering]: An MV3 service worker can be torn down at any
   * `await`. The dangerous suspensions are:
   *
   * 1. Crash **before visual create** — storage is untouched, next alarm re-detects and the user
   *    gets both notification and sound. Safe (no silent miss).
   * 2. Crash **between visual create and `setStoredPRs`** — storage is untouched, next alarm
   *    re-detects and the user gets a duplicate visual + sound. The window is one
   *    `chrome.notifications.create` round-trip, ≈ms on a healthy worker. Tolerable.
   * 3. Crash **between `setStoredPRs` and sound** — PR is recorded as seen, original visual
   *    already shown. Next alarm sees it in stored list and stays silent. User missed the sound
   *    but saw the banner; visual is the user-facing guarantee.
   * 4. Crash **during sound playback** (the previous worst case at up to 5 s for custom sounds) —
   *    same as case 3 now. No duplicate sound on the next tick.
   *
   * The previous design called the combined `showAssignedPRNotifications` (visual + sound) before
   * `setStoredPRs`, which extended the dangerous window across the full sound playback await.
   * Splitting visual and sound around the persist collapses that window to case 2 above.
   */
  private async persistAndNotifyAssigned(
    allPRs: PullRequest[],
    filteredPendingCount: number,
    newPRs: PullRequest[],
    forceRefresh: boolean
  ): Promise<void> {
    let visualFired = false;
    let warmAudio: Promise<void> | undefined;
    if (newPRs.length > 0 && !forceRefresh) {
      this.debugService.log(`[PRService] Showing notifications for ${newPRs.length} new PR(s)`);
      // WHY [parallel warm]: offscreen create overlaps the visual round-trip so the first sound
      // after a cold worker wake does not trail the toast.
      warmAudio = this.notificationService.warmNotificationAudio();
      const visual = await this.notificationService.createAssignedPRVisuals(newPRs);
      visualFired = visual.fired;
    }

    await this.storageService.setStoredPRs(STORAGE_KEY_ASSIGNED_PRS, allPRs);
    this.markListRefreshedForCurrentViewer('assigned');
    await this.storageService.setLastFetchTime(Date.now());
    await this.badgeService.setPRCountBadge(filteredPendingCount);

    // WHY [sound last]: see ordering rationale above. Sound must follow `setStoredPRs` so a
    // worker suspension during playback cannot resurrect the PR as "new" on the next alarm.
    if (visualFired) {
      if (warmAudio) {
        await warmAudio;
      }
      await this.notificationService.playAssignedSound();
    }
  }

  private markAsExistingBaseline(prs: PullRequest[]): PullRequest[] {
    return prs.map((pr) => ({ ...pr, isNew: false }));
  }

  /**
   * WHY [tombstone after assess, before notify]: trust assessment decides what list to persist;
   * tombstones decide *notification eligibility* on top of that. They are orthogonal — an
   * operational shrink can also be a flap. Resurrection within {@link TOMBSTONE_ALARM_WINDOW}
   * means a key briefly vanished and returned; `comparePRs` would tag it `isNew` because it is
   * absent from `oldPRs`, so without this filter the user gets a spurious "new PR" notification
   * for a PR that was never actually new. The signal also raises a `pr_list_churn` outage so the
   * popup banner reflects the integrity event even when Statuspage is green.
   *
   * Drops are recorded **after** the resurrection check so a key that just reappeared is not
   * immediately re-tombstoned by a stale `oldKeys` snapshot. Always called on persist branches
   * (trusted + trusted_operational_shrink) so flapping is detected even when the assessor would
   * have signed the same shrink off as legitimate.
   *
   * Assigned may pass keys filtered by `showDraftsInList`; those drops are client-side display
   * state, not evidence that GitHub omitted the row. Resurrection checks still use the persisted
   * fresh list so existing real tombstones continue to signal churn when the key actually returns.
   *
   * Returns the (possibly mutated) `newPRs` and `allPRsWithStatus` arrays — callers must use the
   * returned values for the actual notify + persist calls.
   */
  private async applyTombstoneFilter(args: {
    listKind: ListKind;
    oldPRs: PullRequest[];
    freshList: PullRequest[];
    newPRs: PullRequest[];
    allPRsWithStatus: PullRequest[];
    dropIgnoredKeys?: string[];
  }): Promise<{ newPRs: PullRequest[]; allPRsWithStatus: PullRequest[] }> {
    const { listKind, oldPRs, freshList } = args;
    const alarmSeq = await this.alarmSeqClock.current();
    const oldKeys = oldPRs.map(getPrKey);
    const freshKeys = freshList.map(getPrKey);

    const resurrected = await this.tombstoneStore.findResurrected({
      listKind,
      freshKeys,
      currentAlarmSeq: alarmSeq,
    });

    let { newPRs, allPRsWithStatus } = args;

    if (resurrected.length > 0) {
      const resurrectedSet = new Set(resurrected);
      this.debugService.warn(
        `[PRService] Tombstone resurrection on ${listKind} (${resurrected.length} key(s)) — suppressing 'new PR' notifications and signaling pr_list_churn.`
      );
      newPRs = newPRs.filter((pr) => !resurrectedSet.has(getPrKey(pr)));
      allPRsWithStatus = allPRsWithStatus.map((pr) =>
        resurrectedSet.has(getPrKey(pr)) ? { ...pr, isNew: false } : pr
      );
      await this.healthStatusService.signalGitHubOutage(
        `List integrity: ${resurrected.length} resurrected key(s) on ${listKind}`,
        'pr_list_churn'
      );
      this.suppressGitHubOutageClearForListChurnWave = true;
      await this.tombstoneStore.clearKeys(listKind, resurrected);
    }

    const dropIgnoredSet = new Set(args.dropIgnoredKeys ?? []);
    const oldKeysForDropRecord =
      dropIgnoredSet.size === 0 ? oldKeys : oldKeys.filter((key) => !dropIgnoredSet.has(key));

    await this.tombstoneStore.recordDrops({
      listKind,
      oldKeys: oldKeysForDropRecord,
      freshKeys,
      currentAlarmSeq: alarmSeq,
    });

    return { newPRs, allPRsWithStatus };
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

  /**
   * Returns the keys of currently-stored merged PRs as a Set, or an empty Set on failure.
   * Best-effort read — cross-list pruning is a safety net, not a correctness invariant.
   *
   * WHY [snapshot once per authored update]: doUpdateMergedPRs runs before doUpdateAuthoredPRs
   * in the alarm wave (EventService.handleAlarm), so this snapshot reflects the wave's merges.
   * Manual authored refresh reads whatever the most recent alarm left in storage.
   */
  private async readMergedKeySet(): Promise<Set<string>> {
    try {
      const merged = await this.storageService.getStoredPRs(STORAGE_KEY_MERGED_PRS);
      return new Set((merged?.prs ?? []).map(getPrKey));
    } catch (err) {
      this.debugService.warn(
        '[PRService] readMergedKeySet failed; skipping cross-list prune.',
        err
      );
      return new Set();
    }
  }

  private pruneOldByMergedKeys(
    oldPRs: PullRequest[],
    mergedKeys: ReadonlySet<string>
  ): PullRequest[] {
    if (oldPRs.length === 0 || mergedKeys.size === 0) return oldPRs;
    return oldPRs.filter((pr) => !mergedKeys.has(getPrKey(pr)));
  }

  /**
   * Used by the suspect_partial / suspect_empty_pending / suspect_empty_corroborated /
   * fetch-error branches in doUpdateAuthoredPRs. Returns the (possibly pruned) preserved
   * list and writes storage iff it actually shrank.
   *
   * WHY [no markListRefreshedForCurrentViewer / recordTrustedFetch]: this is NOT a trusted
   * fetch — we still reject the fresh authored response. We only acknowledge already-trusted
   * merged evidence. Marking refresh would falsely advance the cycle.
   *
   * WHY [conditional write]: avoids spurious chrome.storage.onChanged events that would
   * re-render the popup with no semantic delta.
   */
  private async preserveAuthoredWithMergedReconciliation(
    oldPRs: PullRequest[],
    mergedKeys: ReadonlySet<string>,
    reasonLabel: string
  ): Promise<PullRequest[]> {
    const pruned = this.pruneOldByMergedKeys(oldPRs, mergedKeys);
    if (pruned.length === oldPRs.length) {
      return oldPRs;
    }
    this.debugService.log(
      `[PRService] authored ${reasonLabel}: pruned ${oldPRs.length - pruned.length} PR(s) found in merged storage; persisting reconciled list (${pruned.length}).`
    );
    await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, pruned);
    return pruned;
  }

  async updateAuthoredPRs(
    forceRefresh = false,
    bypassCache = false,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]> {
    return this.withInflightDedup('authored', { forceRefresh, bypassCache }, 'Authored', () =>
      this.doUpdateAuthoredPRs(forceRefresh, bypassCache, waveStatus)
    );
  }

  private async doUpdateAuthoredPRs(
    forceRefresh: boolean,
    bypassCache: boolean,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]> {
    this.debugService.log(
      `[PRService] Updating authored PRs (force: ${forceRefresh}, bypassCache: ${bypassCache})`
    );

    const stored = await this.storageService.getStoredPRs(STORAGE_KEY_AUTHORED_PRS);
    const oldPRs = stored?.prs || [];
    // WHY [pre-fetch merged keys]: doUpdateMergedPRs runs before doUpdateAuthoredPRs in the
    // alarm wave, so merged storage already reflects this wave's merges. The suspect / error
    // branches below preserve `oldPRs` instead of writing fresh; this snapshot lets them still
    // drop authored entries that are now in merged.
    const mergedKeysForReconciliation = await this.readMergedKeySet();

    try {
      const cached = this.tryTtlCachedPrList(stored, forceRefresh, bypassCache, 'Authored');
      if (cached) return cached;

      const freshAuthoredPRsRaw = await this.gitHubService.fetchAuthoredPRs();
      this.debugService.log(
        `[PRService] Fetched ${freshAuthoredPRsRaw.length} authored PRs from GitHub`
      );

      const { accountSwap } = await this.detectAccountSwap('refreshing authored list baseline');
      if (!accountSwap) {
        const authoredTrust = await this.trustAssessor.assess(
          oldPRs,
          freshAuthoredPRsRaw,
          waveStatus
        );
        const dispatch = await this.dispatchPrListAssessment({
          listKind: 'authored',
          assessment: authoredTrust,
          oldCount: oldPRs.length,
          currentLogin: this.gitHubService.getLastResolvedViewerLogin(),
        });
        switch (dispatch.branch) {
          case 'suspect_partial': {
            this.debugService.warn(
              `[PRService] Trust gate: partial-drop authored fetch (${authoredTrust.reasons.join(', ')}) — preserving ${oldPRs.length} stored authored PRs (may reconcile against merged storage).`
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
            return await this.preserveAuthoredWithMergedReconciliation(
              oldPRs,
              mergedKeysForReconciliation,
              'suspect_partial'
            );
          }
          case 'suspect_empty_pending': {
            this.debugService.log(
              `[PRService] authored empty pending confirmation (streak=${dispatch.streak}/${dispatch.threshold})`
            );
            return await this.preserveAuthoredWithMergedReconciliation(
              oldPRs,
              mergedKeysForReconciliation,
              'suspect_empty_pending'
            );
          }
          case 'suspect_empty_accept': {
            this.debugService.log(
              `[PRService] authored empty accepted after ${dispatch.streak} confirmations — persisting [].`
            );
            await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, []);
            this.markListRefreshedForCurrentViewer('authored');
            await this.markRecoveryBaseline('authored');
            await this.limboPromoter.recordTrustedFetch('authored', 0);
            await this.rateLimitService.recordSuccess();
            await this.healthStatusService.clearParserBreakage();
            await this.maybeClearGitHubOutageAfterListSuccess();
            return [];
          }
          case 'suspect_empty_corroborated': {
            this.debugService.warn(
              `[PRService] Trust gate: empty authored fetch corroborated by Statuspage — preserving ${oldPRs.length} stored authored PRs (may reconcile against merged storage).`
            );
            await this.limboPromoter.recordSuspiciousFetch(
              'authored',
              [...authoredTrust.reasons, 'corroborated_by_statuspage'],
              oldPRs,
              freshAuthoredPRsRaw
            );
            await this.persistUntrustedFetchMetadata(
              `Suspicious authored list (corroborated): ${authoredTrust.reasons.join(', ')}`
            );
            return await this.preserveAuthoredWithMergedReconciliation(
              oldPRs,
              mergedKeysForReconciliation,
              'suspect_empty_corroborated'
            );
          }
          case 'suspect_empty_reset_swap': {
            this.debugService.log(
              '[PRService] authored empty under identity mismatch; trusting fresh as baseline.'
            );
            await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, []);
            this.markListRefreshedForCurrentViewer('authored');
            await this.limboPromoter.recordTrustedFetch('authored', 0);
            await this.rateLimitService.recordSuccess();
            await this.healthStatusService.clearParserBreakage();
            await this.maybeClearGitHubOutageAfterListSuccess();
            return [];
          }
          case 'trusted_operational_shrink':
            this.debugService.log(
              `[PRService] authored operational shrink (${authoredTrust.reasons.join(', ')}) — persisting fresh list.`
            );
            break;
          case 'trusted':
            break;
        }
      } else {
        this.debugService.log(
          '[PRService] Account swap detected for authored PRs; trusting fresh list as new baseline.'
        );
        await this.emptyTracker.clear('authored');
      }

      const recoveryBaseline =
        !accountSwap &&
        freshAuthoredPRsRaw.length > 0 &&
        (await this.consumeRecoveryBaseline('authored'));
      const treatAsBaseline = accountSwap || recoveryBaseline;
      let freshAuthoredPRs = treatAsBaseline
        ? this.markAsExistingBaseline(freshAuthoredPRsRaw)
        : freshAuthoredPRsRaw;

      if (!treatAsBaseline) {
        // WHY [authored does not notify]: applyTombstoneFilter still runs so drops are recorded and
        // the pr_list_churn signal fires on resurrection — integrity semantics match assigned/merged.
        // The Authored tab is list-only (noise budget); see notifications-and-sound docs.
        const filtered = await this.applyTombstoneFilter({
          listKind: 'authored',
          oldPRs,
          freshList: freshAuthoredPRs,
          newPRs: [],
          allPRsWithStatus: freshAuthoredPRs,
        });
        freshAuthoredPRs = filtered.allPRsWithStatus;
      }

      await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, freshAuthoredPRs);
      this.markListRefreshedForCurrentViewer('authored');
      await this.limboPromoter.recordTrustedFetch('authored', freshAuthoredPRs.length);

      await this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.maybeClearGitHubOutageAfterListSuccess();
      this.debugService.log(
        `[PRService] Successfully updated ${freshAuthoredPRs.length} authored PRs`
      );
      return freshAuthoredPRs;
    } catch (error) {
      // WHY [updateBadgeOnError: false]: Authored is a secondary list — its failures must not
      // blow away a healthy assigned badge count.
      const preserved = await this.fetchErrorHandler.handle(error, {
        listKind: 'authored',
        oldPRs,
        updateBadgeOnError: false,
        transportErrorLabel: 'Error updating authored PRs',
      });
      // WHY [post-handle reconcile]: ParserBreakage / GitHubOutage paths return oldPRs
      // unchanged. Same rationale as the suspect branches — known-merged PRs must come off
      // the authored tab. Re-throwable errors throw before reaching here.
      return await this.preserveAuthoredWithMergedReconciliation(
        preserved,
        mergedKeysForReconciliation,
        'fetch_error'
      );
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
  async updateMergedPRs(
    forceRefresh = false,
    bypassCache = false,
    waveStatus?: GitHubStatusSnapshot
  ): Promise<PullRequest[]> {
    return this.withInflightDedup('merged', { forceRefresh, bypassCache }, 'Merged', () =>
      this.doUpdateMergedPRs(forceRefresh, bypassCache, waveStatus)
    );
  }

  private async doUpdateMergedPRs(
    forceRefresh: boolean,
    bypassCache: boolean,
    waveStatus?: GitHubStatusSnapshot
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

      const { accountSwap } = await this.detectAccountSwap('silent merged baseline');
      const currentLogin = this.gitHubService.getLastResolvedViewerLogin();
      const implicitStaleMergedBaseline = this.isImplicitStaleMergedBaseline(
        oldPRs,
        freshMergedPRs,
        currentLogin,
        accountSwap
      );
      let newPRs: PullRequest[] = [];
      let mergedPRsWithStatus: PullRequest[];

      if (accountSwap || implicitStaleMergedBaseline) {
        if (accountSwap) {
          this.debugService.log(
            '[PRService] Account swap detected for merged PRs; trusting fresh list as new baseline.'
          );
        } else {
          this.debugService.log(
            '[PRService] Implicit stale merged baseline (stored authors ≠ viewer, zero key overlap); trusting fresh list.'
          );
        }
        await this.emptyTracker.clear('merged');
        mergedPRsWithStatus = this.markAsExistingBaseline(freshMergedPRs);
        await this.limboPromoter.recordTrustedFetch('merged', mergedPRsWithStatus.length);
      } else {
        const mergedTrust = await this.trustAssessor.assess(oldPRs, freshMergedPRs, waveStatus);
        const dispatch = await this.dispatchPrListAssessment({
          listKind: 'merged',
          assessment: mergedTrust,
          oldCount: oldPRs.length,
          currentLogin: this.gitHubService.getLastResolvedViewerLogin(),
        });
        switch (dispatch.branch) {
          case 'suspect_partial': {
            this.debugService.warn(
              `[PRService] Trust gate: partial-drop merged fetch (${mergedTrust.reasons.join(', ')}) — preserving ${oldPRs.length} stored merged PRs.`
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
          case 'suspect_empty_pending': {
            this.debugService.log(
              `[PRService] merged empty pending confirmation (streak=${dispatch.streak}/${dispatch.threshold})`
            );
            return oldPRs;
          }
          case 'suspect_empty_accept': {
            this.debugService.log(
              `[PRService] merged empty accepted after ${dispatch.streak} confirmations — persisting [].`
            );
            await this.storageService.setStoredPRs(STORAGE_KEY_MERGED_PRS, []);
            this.markListRefreshedForCurrentViewer('merged');
            await this.markRecoveryBaseline('merged');
            await this.limboPromoter.recordTrustedFetch('merged', 0);
            await this.rateLimitService.recordSuccess();
            await this.healthStatusService.clearParserBreakage();
            await this.maybeClearGitHubOutageAfterListSuccess();
            return [];
          }
          case 'suspect_empty_corroborated': {
            this.debugService.warn(
              `[PRService] Trust gate: empty merged fetch corroborated by Statuspage — preserving ${oldPRs.length} stored merged PRs.`
            );
            await this.limboPromoter.recordSuspiciousFetch(
              'merged',
              [...mergedTrust.reasons, 'corroborated_by_statuspage'],
              oldPRs,
              freshMergedPRs
            );
            await this.persistUntrustedFetchMetadata(
              `Suspicious merged list (corroborated): ${mergedTrust.reasons.join(', ')}`
            );
            return oldPRs;
          }
          case 'suspect_empty_reset_swap': {
            this.debugService.log(
              '[PRService] merged empty under identity mismatch; trusting fresh as baseline.'
            );
            await this.storageService.setStoredPRs(STORAGE_KEY_MERGED_PRS, []);
            this.markListRefreshedForCurrentViewer('merged');
            await this.limboPromoter.recordTrustedFetch('merged', 0);
            await this.rateLimitService.recordSuccess();
            await this.healthStatusService.clearParserBreakage();
            await this.maybeClearGitHubOutageAfterListSuccess();
            return [];
          }
          case 'trusted_operational_shrink':
            this.debugService.log(
              `[PRService] merged operational shrink (${mergedTrust.reasons.join(', ')}) — under threshold, persisting fresh list.`
            );
            break;
          case 'trusted':
            break;
        }

        const recoveryBaseline =
          freshMergedPRs.length > 0 && (await this.consumeRecoveryBaseline('merged'));
        if (recoveryBaseline) {
          // WHY [recovery baseline parity]: Returning PRs after an accepted-empty
          // window must not flood notifications. Mirror the account-swap branch:
          // mark fresh as baseline and skip the comparePRs/notification path.
          mergedPRsWithStatus = this.markAsExistingBaseline(freshMergedPRs);
          await this.limboPromoter.recordTrustedFetch('merged', mergedPRsWithStatus.length);
        } else {
          const trustedMergedPRs = await this.limboPromoter.promoteTrustedMergedList(
            oldPRs,
            freshMergedPRs,
            mergedTrust.missConfirmationsRequired
          );

          ({ newPRs, allPRsWithStatus: mergedPRsWithStatus } = this.comparePRs(
            oldPRs,
            trustedMergedPRs
          ));
          newPRs = this.mergedNotificationEligibility.filterFreshCandidates(
            newPRs,
            storedData?.timestamp,
            mergedTrust.status
          );
          // WHY [tombstone after notification eligibility]: Resurrection suppression must run AFTER
          // mergedNotificationEligibility (which already drops stale-window candidates) so the
          // pr_list_churn signal is reserved for genuine flapping, not for PRs the freshness
          // window would have suppressed anyway.
          ({ newPRs, allPRsWithStatus: mergedPRsWithStatus } = await this.applyTombstoneFilter({
            listKind: 'merged',
            oldPRs,
            freshList: mergedPRsWithStatus,
            newPRs,
            allPRsWithStatus: mergedPRsWithStatus,
          }));
        }
      }
      this.debugService.log(`[PRService] Newly merged PRs detected: ${newPRs.length}`);

      // WHY [visual → persist → sound]: same rationale as persistAndNotifyAssigned. Visual fires
      // before persist so a crash before persist still re-notifies on the next tick (no silent
      // miss). Sound fires after persist so a crash during the long playback window does not
      // resurrect the PR as "new" and replay the sound on the next alarm.
      let visualFired = false;
      let warmAudio: Promise<void> | undefined;
      if (newPRs.length > 0 && !forceRefresh) {
        this.debugService.log(
          `[PRService] Triggering merged PR notifications for ${newPRs.length} PR(s)`
        );
        warmAudio = this.notificationService.warmNotificationAudio();
        const visual = await this.notificationService.createMergedPRVisuals(newPRs);
        visualFired = visual.fired;
      } else if (newPRs.length === 0) {
        this.debugService.log('[PRService] No new merged PRs detected, skipping notifications');
      } else if (forceRefresh) {
        this.debugService.log('[PRService] Force refresh detected, skipping merged notifications');
      }

      await this.storageService.setStoredPRs(STORAGE_KEY_MERGED_PRS, mergedPRsWithStatus);
      this.markListRefreshedForCurrentViewer('merged');

      if (visualFired) {
        if (warmAudio) {
          await warmAudio;
        }
        await this.notificationService.playMergedSound();
      }

      await this.rateLimitService.recordSuccess();
      await this.healthStatusService.clearParserBreakage();
      await this.maybeClearGitHubOutageAfterListSuccess();
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

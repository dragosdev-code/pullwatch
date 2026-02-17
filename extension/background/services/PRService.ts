import type { IPRService } from '../interfaces/IPRService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IGitHubService } from '../interfaces/IGitHubService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IBadgeService } from '../interfaces/IBadgeService';
import type { PullRequest } from '../../common/types';
import {
  CACHE_TTL_MS,
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../../common/constants';

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
  private initialized = false;

  constructor(deps: {
    debugService: IDebugService;
    storageService: IStorageService;
    gitHubService: IGitHubService;
    notificationService: INotificationService;
    badgeService: IBadgeService;
  }) {
    this.debugService = deps.debugService;
    this.storageService = deps.storageService;
    this.gitHubService = deps.gitHubService;
    this.notificationService = deps.notificationService;
    this.badgeService = deps.badgeService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[PRService] PR service initialized');
  }

  async fetchAndUpdateAssignedPRs(forceRefresh = false): Promise<PullRequest[]> {
    this.debugService.log(
      `[PRService] Fetching and updating assigned PRs (force: ${forceRefresh})`
    );

    try {
      // Get current stored PRs for comparison and cache check
      const storedData = await this.storageService.getStoredPRs(STORAGE_KEY_ASSIGNED_PRS);

      // Check cache before fetching from GitHub
      const isCacheValid =
        storedData && storedData.timestamp && Date.now() - storedData.timestamp < CACHE_TTL_MS;

      if (isCacheValid && !forceRefresh) {
        this.debugService.log('[PRService] Returning cached Assigned PRs');
        return storedData.prs;
      }

      const oldPRs = storedData?.prs || [];
      this.debugService.log(`[PRService] Current stored PRs count: ${oldPRs.length}`);

      const oldPendingPRs = oldPRs.filter((pr) => pr.reviewStatus !== 'reviewed');
      this.debugService.log(
        `[PRService] Current stored pending PRs count: ${oldPendingPRs.length}`
      );

      // Fetch fresh PRs from GitHub
      const [freshPendingPRsRaw, freshReviewedPRsRaw] = await Promise.all([
        this.gitHubService.fetchAssignedPRs(),
        this.gitHubService.fetchReviewedPRs(),
      ]);
      this.debugService.log(
        `[PRService] Fetched fresh pending PRs: ${freshPendingPRsRaw.length}, reviewed PRs: ${freshReviewedPRsRaw.length}`
      );

      const freshPendingPRs = freshPendingPRsRaw.map((pr) => ({
        ...pr,
        reviewStatus: 'pending' as const,
      }));

      const { newPRs, allPRsWithStatus: pendingPRsWithStatus } = this.comparePRs(
        oldPendingPRs,
        freshPendingPRs
      );
      this.debugService.log(`[PRService] New pending PRs detected: ${newPRs.length}`);

      // Deduplicate: exclude reviewed PRs that are already in the pending list
      const pendingIds = new Set(pendingPRsWithStatus.map((pr) => pr.id || pr.url));

      const freshReviewedPRs = freshReviewedPRsRaw
        .filter((pr) => !pendingIds.has(pr.id || pr.url))
        .filter((pr) => pr.type !== 'merged')
        .map(
          (pr): PullRequest => ({
            ...pr,
            reviewStatus: 'reviewed' as const,
            isNew: false,
          })
        );

      // Only use fresh API data — no merging with stale stored reviewed PRs
      const allPRsWithStatus = [...pendingPRsWithStatus, ...freshReviewedPRs];
      this.debugService.log(
        `[PRService] Total PRs to store (pending + reviewed): ${allPRsWithStatus.length}`
      );

      // Update storage with fresh data and last fetch time
      await this.storageService.setStoredPRs(STORAGE_KEY_ASSIGNED_PRS, allPRsWithStatus);
      await this.storageService.setLastFetchTime(Date.now());

      // Update badge with current count
      await this.badgeService.setPRCountBadge(pendingPRsWithStatus.length);

      // Show notifications for new PRs (NotificationService handles sound)
      if (newPRs.length > 0 && !forceRefresh) {
        this.debugService.log(`[PRService] Showing notifications for ${newPRs.length} new PR(s)`);
        await this.notificationService.showNewPRNotifications(newPRs);
      } else if (newPRs.length === 0) {
        this.debugService.log('[PRService] No new PRs detected, skipping notifications');
      } else if (forceRefresh) {
        this.debugService.log('[PRService] Force refresh detected, skipping notifications');
      }

      this.debugService.log(`[PRService] Successfully updated ${allPRsWithStatus.length} PRs`);
      return allPRsWithStatus;
    } catch (error) {
      this.debugService.error('[PRService] Error fetching and updating PRs:', error);
      await this.badgeService.setErrorBadge();
      throw error;
    }
  }

  /**
   * Compares old and new PR lists to identify new PRs.
   * Only considers PRs as "new" if they weren't in the old list (not when PRs are missing).
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

  async updateAuthoredPRs(forceRefresh = false): Promise<PullRequest[]> {
    this.debugService.log(`[PRService] Updating authored PRs (force: ${forceRefresh})`);

    try {
      // Check cache before fetching from GitHub
      const stored = await this.storageService.getStoredPRs(STORAGE_KEY_AUTHORED_PRS);
      const isCacheValid =
        stored && stored.timestamp && Date.now() - stored.timestamp < CACHE_TTL_MS;

      if (isCacheValid && !forceRefresh) {
        this.debugService.log('[PRService] Returning cached Authored PRs');
        return stored.prs;
      }

      const freshAuthoredPRs = await this.gitHubService.fetchAuthoredPRs();
      this.debugService.log(
        `[PRService] Fetched ${freshAuthoredPRs.length} authored PRs from GitHub`
      );

      await this.storageService.setStoredPRs(STORAGE_KEY_AUTHORED_PRS, freshAuthoredPRs);

      this.debugService.log(
        `[PRService] Successfully updated ${freshAuthoredPRs.length} authored PRs`
      );
      return freshAuthoredPRs;
    } catch (error) {
      this.debugService.error('[PRService] Error updating authored PRs:', error);
      throw error;
    }
  }

  async updateMergedPRs(forceRefresh = false): Promise<PullRequest[]> {
    this.debugService.log(`[PRService] Updating merged PRs (force: ${forceRefresh})`);

    try {
      // Check cache before fetching from GitHub
      const stored = await this.storageService.getStoredPRs(STORAGE_KEY_MERGED_PRS);
      const isCacheValid =
        stored && stored.timestamp && Date.now() - stored.timestamp < CACHE_TTL_MS;

      if (isCacheValid && !forceRefresh) {
        this.debugService.log('[PRService] Returning cached Merged PRs');
        return stored.prs;
      }

      const freshMergedPRs = await this.gitHubService.fetchMergedPRs();
      this.debugService.log(`[PRService] Fetched ${freshMergedPRs.length} merged PRs from GitHub`);

      await this.storageService.setStoredPRs(STORAGE_KEY_MERGED_PRS, freshMergedPRs);

      this.debugService.log(`[PRService] Successfully updated ${freshMergedPRs.length} merged PRs`);
      return freshMergedPRs;
    } catch (error) {
      this.debugService.error('[PRService] Error updating merged PRs:', error);
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PRService] PR service disposed');
    this.initialized = false;
  }
}

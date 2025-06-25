import type { IPRService } from '../interfaces/IPRService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IGitHubService } from '../interfaces/IGitHubService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IBadgeService } from '../interfaces/IBadgeService';
import type { PullRequest } from '../../common/types';

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

  constructor(
    debugService: IDebugService,
    storageService: IStorageService,
    gitHubService: IGitHubService,
    notificationService: INotificationService,
    badgeService: IBadgeService
  ) {
    this.debugService = debugService;
    this.storageService = storageService;
    this.gitHubService = gitHubService;
    this.notificationService = notificationService;
    this.badgeService = badgeService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[PRService] PR service initialized');
  }

  async fetchAndUpdatePRs(forceRefresh = false): Promise<PullRequest[]> {
    this.debugService.log(`[PRService] Fetching and updating PRs (force: ${forceRefresh})`);

    try {
      // Get current stored PRs for comparison
      const storedData = await this.storageService.getStoredPRs();
      const oldPRs = storedData?.prs || [];
      this.debugService.log(`[PRService] Current stored PRs count: ${oldPRs.length}`);

      // Fetch fresh PRs from GitHub
      const freshPRs = await this.gitHubService.fetchAssignedPRs();
      this.debugService.log(`[PRService] Fetched fresh PRs count: ${freshPRs.length}`);

      // Compare PRs and identify new ones
      const { newPRs, allPRsWithStatus } = this.comparePRs(oldPRs, freshPRs);
      this.debugService.log(`[PRService] New PRs detected: ${newPRs.length}`);

      // Update storage with fresh data and last fetch time
      await this.storageService.setStoredPRs(allPRsWithStatus);
      await this.storageService.setLastFetchTime(Date.now());

      // Update badge with current count
      await this.badgeService.setPRCountBadge(allPRsWithStatus.length);

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
  private comparePRs(
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

      if (!existingPR) {
        // This is a new PR - mark it as new and add to new PRs list
        this.debugService.log(`[PRService] New PR detected: ${freshPR.title} (${key})`);
        const newPR = { ...freshPR, isNew: true };
        newPRs.push(newPR);
        allPRsWithStatus.push(newPR);
      } else {
        // This PR already existed - preserve it but mark as not new
        const existingPRUpdated = { ...freshPR, isNew: false };
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

  async getStoredPRs(): Promise<PullRequest[]> {
    const stored = await this.storageService.getStoredPRs();
    return stored?.prs || [];
  }

  async markPRsAsRead(): Promise<void> {
    try {
      this.debugService.log('[PRService] Marking PRs as read');

      // Get current PRs and mark them all as not new
      const currentPRs = await this.getStoredPRs();
      const updatedPRs = currentPRs.map((pr) => ({ ...pr, isNew: false }));

      // Update storage
      await this.storageService.setStoredPRs(updatedPRs);

      this.debugService.log(`[PRService] Marked ${updatedPRs.length} PRs as read`);
    } catch (error) {
      this.debugService.error('[PRService] Error marking PRs as read:', error);
      throw error;
    }
  }

  async getNewPRs(): Promise<PullRequest[]> {
    const prs = await this.getStoredPRs();
    return prs.filter((pr) => pr.isNew);
  }

  async refreshPRs(): Promise<PullRequest[]> {
    return await this.fetchAndUpdatePRs(true);
  }

  async getPRStats(): Promise<{ total: number; new: number; lastUpdate: number | null }> {
    const prs = await this.getStoredPRs();
    const newPRs = prs.filter((pr) => pr.isNew);
    const lastUpdate = await this.storageService.getLastFetchTime();

    return {
      total: prs.length,
      new: newPRs.length,
      lastUpdate,
    };
  }

  async filterPRs(): Promise<PullRequest[]> {
    // Stub implementation - could be extended for filtering by repo, author, etc.
    return await this.getStoredPRs();
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PRService] PR service disposed');
    this.initialized = false;
  }
}

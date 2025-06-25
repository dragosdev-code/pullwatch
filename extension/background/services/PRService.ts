import type { IPRService } from '../interfaces/IPRService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { IGitHubService } from '../interfaces/IGitHubService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IBadgeService } from '../interfaces/IBadgeService';
import type { PullRequest } from '../../common/types';

/**
 * PRService handles pull request management and coordination between services.
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
      const prs = await this.gitHubService.fetchAssignedPRs();
      await this.storageService.setStoredPRs(prs);
      await this.badgeService.setPRCountBadge(prs.length);
      await this.notificationService.showNewPRNotifications(prs[0]);

      this.debugService.log(`[PRService] Updated ${prs.length} PRs`);
      return prs;
    } catch (error) {
      this.debugService.error('[PRService] Error fetching and updating PRs:', error);
      await this.badgeService.setErrorBadge();
      throw error;
    }
  }

  async getStoredPRs(): Promise<PullRequest[]> {
    const stored = await this.storageService.getStoredPRs();
    return stored?.prs || [];
  }

  async markPRsAsRead(): Promise<void> {
    this.debugService.log('[PRService] Marking PRs as read');
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
    // Stub implementation
    return await this.getStoredPRs();
  }

  async dispose(): Promise<void> {
    this.debugService.log('[PRService] PR service disposed');
    this.initialized = false;
  }
}

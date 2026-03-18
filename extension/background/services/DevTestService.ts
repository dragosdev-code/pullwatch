import type { IDevTestService } from '../interfaces/IDevTestService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { INotificationService } from '../interfaces/INotificationService';
import type { IAlarmService } from '../interfaces/IAlarmService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { ISoundService } from '../interfaces/ISoundService';
import type {
  DevTestNotificationOverrides,
  DevTestLooperState,
  DevTestAlarmOverrideState,
  ScraperUrl,
  PullRequest,
  NotificationSound,
} from '../../common/types';
import {
  GITHUB_BASE_URL,
  GITHUB_REVIEW_REQUESTS_URL_TEMPLATE,
  GITHUB_MERGED_PRS_URL_TEMPLATE,
  GITHUB_REVIEWED_PRS_URL_TEMPLATE,
  GITHUB_AUTHORED_APPROVED_URL_TEMPLATE,
  GITHUB_AUTHORED_CHANGES_REQUESTED_URL_TEMPLATE,
  GITHUB_AUTHORED_PENDING_URL_TEMPLATE,
  GITHUB_AUTHORED_COMMENTED_URL_TEMPLATE,
  GITHUB_AUTHORED_DRAFT_URL_TEMPLATE,
  DEV_TEST_MIN_LOOP_INTERVAL_MS,
} from '../../common/constants';
import { isPlayableSound } from '../../common/sound-config';

export class DevTestService implements IDevTestService {
  private debugService: IDebugService;
  private notificationService: INotificationService;
  private alarmService: IAlarmService;
  private storageService: IStorageService;
  private soundService: ISoundService;
  private initialized = false;

  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private loopSentCount = 0;

  constructor(deps: {
    debugService: IDebugService;
    notificationService: INotificationService;
    alarmService: IAlarmService;
    storageService: IStorageService;
    soundService: ISoundService;
  }) {
    this.debugService = deps.debugService;
    this.notificationService = deps.notificationService;
    this.alarmService = deps.alarmService;
    this.storageService = deps.storageService;
    this.soundService = deps.soundService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[DevTestService] Initialized');
  }

  async dispose(): Promise<void> {
    this.stopLoopInternal();
    this.debugService.log('[DevTestService] Disposed');
    this.initialized = false;
  }

  // ─── Feature 1: Instant Mock Notification ────────────────────────────────

  async fireTestNotification(overrides?: DevTestNotificationOverrides): Promise<void> {
    const settings = await this.storageService.getExtensionSettings();
    const sound: NotificationSound = overrides?.sound ?? settings.assigned.sound;

    const title = overrides?.title?.trim() || 'Test PR: Dev Test Notification';
    const message = overrides?.message?.trim() || 'This is a mock notification from the Dev Test Area';

    const notificationId = `devtest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await this.notificationService.createNotification(
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('logo.png'),
        title,
        message,
        requireInteraction: false,
        silent: true,
        priority: 2,
      },
      notificationId
    );

    if (isPlayableSound(sound)) {
      await this.soundService.playNotificationSound(sound);
    }

    this.debugService.log(
      `[DevTestService] Test notification fired — title="${title}", sound=${sound}`
    );
  }

  // ─── Feature 2: Notification Looper ──────────────────────────────────────

  async startNotificationLoop(intervalMs: number): Promise<DevTestLooperState> {
    this.stopLoopInternal();

    const safeInterval = Math.max(intervalMs, DEV_TEST_MIN_LOOP_INTERVAL_MS);
    this.loopSentCount = 0;

    this.loopTimer = setInterval(async () => {
      try {
        this.loopSentCount++;
        await this.fireTestNotification({
          title: `Loop Notification #${this.loopSentCount}`,
          message: `Auto-fired at ${new Date().toLocaleTimeString()}`,
        });
      } catch (err) {
        this.debugService.error('[DevTestService] Loop notification error:', err);
      }
    }, safeInterval);

    this.debugService.log(`[DevTestService] Notification loop started — interval=${safeInterval}ms`);
    return this.getLooperState();
  }

  async stopNotificationLoop(): Promise<DevTestLooperState> {
    this.stopLoopInternal();
    this.debugService.log('[DevTestService] Notification loop stopped');
    return this.getLooperState();
  }

  getLooperState(): DevTestLooperState {
    return {
      intervalMs: DEV_TEST_MIN_LOOP_INTERVAL_MS,
      isRunning: this.loopTimer !== null,
      sentCount: this.loopSentCount,
    };
  }

  private stopLoopInternal(): void {
    if (this.loopTimer !== null) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  // ─── Feature 3: Alarm Override ───────────────────────────────────────────

  async overrideAlarmInterval(intervalMs: number): Promise<DevTestAlarmOverrideState> {
    await this.alarmService.overrideFetchAlarm(intervalMs);
    return this.getAlarmOverrideState();
  }

  async restoreAlarmInterval(): Promise<DevTestAlarmOverrideState> {
    await this.alarmService.restoreFetchAlarm();
    return this.getAlarmOverrideState();
  }

  async getAlarmOverrideState(): Promise<DevTestAlarmOverrideState> {
    const status = await this.alarmService.getAlarmStatus();
    return {
      intervalMs: status.currentIntervalMs ?? 0,
      isOverridden: status.isOverridden,
    };
  }

  // ─── Feature 4: Scraper URLs ─────────────────────────────────────────────

  getScraperUrls(): ScraperUrl[] {
    const base = GITHUB_BASE_URL;
    return [
      { label: 'Review Requests (Assigned)', url: GITHUB_REVIEW_REQUESTS_URL_TEMPLATE(base) },
      { label: 'Merged PRs', url: GITHUB_MERGED_PRS_URL_TEMPLATE(base) },
      { label: 'Reviewed PRs', url: GITHUB_REVIEWED_PRS_URL_TEMPLATE(base) },
      { label: 'Authored — Approved', url: GITHUB_AUTHORED_APPROVED_URL_TEMPLATE(base) },
      { label: 'Authored — Changes Requested', url: GITHUB_AUTHORED_CHANGES_REQUESTED_URL_TEMPLATE(base) },
      { label: 'Authored — Pending', url: GITHUB_AUTHORED_PENDING_URL_TEMPLATE(base) },
      { label: 'Authored — Commented', url: GITHUB_AUTHORED_COMMENTED_URL_TEMPLATE(base) },
      { label: 'Authored — Draft', url: GITHUB_AUTHORED_DRAFT_URL_TEMPLATE(base) },
    ];
  }

  // ─── Test PR Factory ─────────────────────────────────────────────────────

  static createMockPR(overrides?: Partial<PullRequest>): PullRequest {
    return {
      id: `test-pr-${Date.now()}`,
      url: `${GITHUB_BASE_URL}/test/repo/pull/0`,
      title: 'Test PR: This is a Test Notification',
      number: 0,
      repoName: 'test/repo',
      author: { login: 'test-author' },
      createdAt: new Date().toISOString(),
      isNew: true,
      type: 'open',
      ...overrides,
    };
  }
}

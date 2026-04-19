import type { ServiceContainer } from '../../core/ServiceContainer';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { IPRService } from '../../interfaces/IPRService';
import type { MessageResponse, PullRequest } from '../../../common/types';
import {
  MIN_REFRESH_INTERVAL_MS,
  STORAGE_KEY_LAST_MANUAL_REFRESH_AT,
} from '../../../common/constants';
import {
  GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE,
  isGitHubWebSessionAuthError,
} from '../../../common/errors';

export type ManualPrRefreshKind = 'assigned' | 'merged' | 'authored';

export interface ManualPrRefreshCoordinatorDeps {
  debugService: IDebugService;
  serviceContainer: ServiceContainer;
  /** Shared with install/startup/alarm — owns PR-fetch-in-progress flag and identity-barrier ordering. */
  withPrUiFetchIndicator: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Shared with handleAlarm — clears GitHub web-session caches + resets badge after auth failure. */
  invalidateGitHubWebSessionAfterAuthFailure: () => Promise<void>;
  /** Shared log-level gate so `NotLoggedIn` surfaces as warn, not error. */
  logCatchAsWarningIfAuth: (context: string, error: unknown) => void;
}

interface KindConfig {
  fetchFresh: (prService: IPRService) => Promise<PullRequest[]>;
  getStored: (prService: IPRService) => Promise<PullRequest[]>;
  throttledLog: string;
  fetchingLog: string;
  errorContext: string;
  errorMessage: string;
}

const KIND_CONFIG: Record<ManualPrRefreshKind, KindConfig> = {
  assigned: {
    fetchFresh: (prService) => prService.fetchAndUpdateAssignedPRs(true),
    getStored: (prService) => prService.getStoredAssignedPRs(),
    throttledLog: '[EventService] Manual refresh throttled — returning stored assigned PRs',
    fetchingLog: '[EventService] Manual refresh - fetching fresh assigned PRs from GitHub',
    errorContext: 'Error handling assigned PR data actions',
    errorMessage: 'Failed to handle assigned PR action',
  },
  merged: {
    fetchFresh: (prService) => prService.updateMergedPRs(true),
    getStored: (prService) => prService.getStoredMergedPRs(),
    throttledLog: '[EventService] Manual refresh throttled — returning stored merged PRs',
    fetchingLog: '[EventService] Manual refresh - fetching fresh merged PRs from GitHub',
    errorContext: 'Error handling merged PR data actions',
    errorMessage: 'Failed to handle merged PR action',
  },
  authored: {
    fetchFresh: (prService) => prService.updateAuthoredPRs(true),
    getStored: (prService) => prService.getStoredAuthoredPRs(),
    throttledLog: '[EventService] Manual refresh throttled — returning stored authored PRs',
    fetchingLog: '[EventService] Manual refresh - fetching fresh authored PRs from GitHub',
    errorContext: 'Error handling authored PR data actions',
    errorMessage: 'Failed to handle authored PR action',
  },
};

/**
 * Owns the manual-refresh wave lifecycle for parallel `fetch{Assigned,Merged,Authored}PRs` messages.
 *
 * WHY [extracted from EventService]: All three former handlers shared identical throttle / depth /
 * alarm-pushback / fetch-wrap / catch logic — only the PR-service method and log strings differed.
 * Keeping the state here (wave flag, depth, push-back inflight) guarantees one source of truth for
 * the wave: siblings see the same `manualRefreshWaveActive` after the leader sets it post-`session.get`.
 */
export class ManualPrRefreshCoordinator {
  private readonly debugService: IDebugService;
  private readonly serviceContainer: ServiceContainer;
  private readonly withPrUiFetchIndicator: <T>(fn: () => Promise<T>) => Promise<T>;
  private readonly invalidateGitHubWebSessionAfterAuthFailure: () => Promise<void>;
  private readonly logCatchAsWarningIfAuth: (context: string, error: unknown) => void;

  /** Coalesces parallel manual refresh messages into one alarm reset. */
  private fetchAlarmPushBackInFlight: Promise<void> | null = null;
  /**
   * WHY [manual refresh only]: Parallel `fetch*` messages share one wave; set after `session.get` resolves
   * so siblings re-check this flag and skip the time window (see `shouldThrottleManualRefresh`).
   */
  private waveActive = false;
  /** WHY [vs prUiFetchDepth]: Only manual `fetch*` handlers increment this — alarms must not clear `waveActive`. */
  private waveDepth = 0;

  constructor(deps: ManualPrRefreshCoordinatorDeps) {
    this.debugService = deps.debugService;
    this.serviceContainer = deps.serviceContainer;
    this.withPrUiFetchIndicator = deps.withPrUiFetchIndicator;
    this.invalidateGitHubWebSessionAfterAuthFailure = deps.invalidateGitHubWebSessionAfterAuthFailure;
    this.logCatchAsWarningIfAuth = deps.logCatchAsWarningIfAuth;
  }

  get manualRefreshWaveActive(): boolean {
    return this.waveActive;
  }

  /**
   * Executes one manual-refresh handler for the given PR list kind.
   * Preserves the exact throttle / depth / push-back / catch semantics from the original
   * per-kind `handle*PRDataActions` methods — only the PRService call and log strings vary.
   */
  async run(
    kind: ManualPrRefreshKind,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    const config = KIND_CONFIG[kind];
    try {
      const prService = this.serviceContainer.getService('prService');

      if (await this.shouldThrottleManualRefresh()) {
        this.debugService.log(config.throttledLog);
        const storedPRs = await config.getStored(prService);
        sendResponse({ success: true, data: storedPRs });
        return;
      }
      this.waveDepth += 1;
      try {
        this.debugService.log(config.fetchingLog);
        await this.coalescedPushBackFetchAlarm();
        const prs = await this.withPrUiFetchIndicator(async () => config.fetchFresh(prService));
        sendResponse({ success: true, data: prs });
      } finally {
        this.waveDepth -= 1;
        if (this.waveDepth === 0) {
          this.waveActive = false;
        }
      }
    } catch (error) {
      if (isGitHubWebSessionAuthError(error)) {
        await this.invalidateGitHubWebSessionAfterAuthFailure();
      }
      this.logCatchAsWarningIfAuth(config.errorContext, error);
      sendResponse({
        success: false,
        error: isGitHubWebSessionAuthError(error)
          ? GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE
          : config.errorMessage,
      });
    }
  }

  /**
   * Ensures concurrent manual refresh handlers share one alarm reschedule (popup fires three messages).
   */
  private coalescedPushBackFetchAlarm(): Promise<void> {
    if (this.fetchAlarmPushBackInFlight !== null) {
      return this.fetchAlarmPushBackInFlight;
    }
    const alarmService = this.serviceContainer.getService('alarmService');
    const pending = alarmService.rescheduleFetchAlarmFromNow().finally(() => {
      this.fetchAlarmPushBackInFlight = null;
    });
    this.fetchAlarmPushBackInFlight = pending;
    return pending;
  }

  /**
   * Determines whether a manual refresh wave should be throttled.
   *
   * WHY [dual mechanism]: In-memory `waveActive` coordinates parallel `fetch*` handlers in one
   * SW activation; `chrome.storage.session` carries `last_manual_refresh_at` across service worker sleep.
   *
   * @returns `true` = throttled (caller returns stored PRs only); `false` = allowed (GitHub fetch).
   */
  private async shouldThrottleManualRefresh(): Promise<boolean> {
    if (this.waveActive) {
      return false;
    }

    const result = await chrome.storage.session.get(STORAGE_KEY_LAST_MANUAL_REFRESH_AT);
    const lastAt = (result[STORAGE_KEY_LAST_MANUAL_REFRESH_AT] as number | undefined) ?? 0;

    // WHY [double-check-after-await]: Parallel handlers all await `get` together; the leader sets
    // `waveActive` before yielding — siblings must not time-check against a timestamp the leader
    // just wrote, nor claim a second `session.set`.
    if (this.waveActive) {
      return false;
    }

    if (Date.now() - lastAt < MIN_REFRESH_INTERVAL_MS) {
      return true;
    }

    this.waveActive = true;

    chrome.storage.session.set({ [STORAGE_KEY_LAST_MANUAL_REFRESH_AT]: Date.now() }).catch((err) => {
      this.debugService.error('[EventService] Failed to persist manual refresh timestamp:', err);
    });

    return false;
  }
}

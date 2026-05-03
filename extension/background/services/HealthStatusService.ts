import type { GitHubOutageReason, IHealthStatusService } from '../interfaces/IHealthStatusService';
import {
  STORAGE_KEY_PARSER_BREAKAGE,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
} from '@common/constants';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import { chromeExtensionService } from '@common/chrome-extension-service';
import type { GitHubOutagePayload } from '@common/types';

/**
 * Persists and broadcasts health status flags (parser breakage, GitHub outage)
 * so the popup UI can show the appropriate banner and the background service
 * can skip redundant writes on repeated errors.
 *
 * Each flag follows the same lifecycle:
 *   1. On first error → persist to chrome.storage.local + broadcast "detected"
 *   2. On subsequent errors → refresh the outage's `lastSeenAt` only
 *   3. On recovery (successful fetch) → remove from storage + broadcast "cleared"
 *      (outage clear also drops {@link STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT} so the popup’s
 *      “last untrusted attempt” line does not outlive the banner.)
 *
 * Parser breakage and GitHub outage are separate flags because they require
 * different user-facing messaging ("wait it out" vs "extension update incoming")
 * and different developer-facing triage.
 */
export class HealthStatusService implements IHealthStatusService {
  private parserBroken = false;
  private githubOutage = false;

  private async refreshGitHubOutageLastSeen(now: number): Promise<void> {
    const stored = await chromeExtensionService.storage.local.get(STORAGE_KEY_GITHUB_OUTAGE);
    const current = stored[STORAGE_KEY_GITHUB_OUTAGE] as Partial<GitHubOutagePayload> | undefined;
    if (!current || current.detected !== true) return;

    await chromeExtensionService.storage.local.set({
      [STORAGE_KEY_GITHUB_OUTAGE]: {
        ...current,
        lastSeenAt: now,
      },
    });
  }

  async initialize(): Promise<void> {
    const stored = await chromeExtensionService.storage.local.get([
      STORAGE_KEY_PARSER_BREAKAGE,
      STORAGE_KEY_GITHUB_OUTAGE,
    ]);
    this.parserBroken = !!stored[STORAGE_KEY_PARSER_BREAKAGE];
    this.githubOutage = !!stored[STORAGE_KEY_GITHUB_OUTAGE];
  }

  async signalParserBreakage(context: string): Promise<void> {
    if (this.parserBroken) return;
    this.parserBroken = true;
    const payload = { detected: true, timestamp: Date.now(), context };
    await chromeExtensionService.storage.local.set({ [STORAGE_KEY_PARSER_BREAKAGE]: payload });
    chromeExtensionService.runtime
      .sendMessage({
        action: BROADCAST_ACTION.parserBreakageDetected,
        data: payload,
      })
      .catch(() => {});
  }

  async clearParserBreakage(): Promise<void> {
    if (!this.parserBroken) return;
    this.parserBroken = false;
    await chromeExtensionService.storage.local.remove(STORAGE_KEY_PARSER_BREAKAGE);
    chromeExtensionService.runtime
      .sendMessage({
        action: BROADCAST_ACTION.parserBreakageCleared,
        data: null,
      })
      .catch(() => {});
  }

  async signalGitHubOutage(
    context: string,
    reason: GitHubOutageReason = 'transport'
  ): Promise<void> {
    const now = Date.now();
    if (this.githubOutage) {
      // WHY [single banner]: Keep first context/reason stable for the active window, but refresh
      // liveness so the popup can distinguish a real ongoing outage from stale storage.
      await this.refreshGitHubOutageLastSeen(now);
      return;
    }
    this.githubOutage = true;
    const payload: GitHubOutagePayload = {
      detected: true,
      timestamp: now,
      lastSeenAt: now,
      context,
      reason,
    };
    await chromeExtensionService.storage.local.set({ [STORAGE_KEY_GITHUB_OUTAGE]: payload });
    chromeExtensionService.runtime
      .sendMessage({
        action: BROADCAST_ACTION.githubOutageDetected,
        data: payload,
      })
      .catch(() => {});
  }

  async clearGitHubOutage(): Promise<void> {
    if (!this.githubOutage) return;
    this.githubOutage = false;
    await chromeExtensionService.storage.local.remove([
      STORAGE_KEY_GITHUB_OUTAGE,
      STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
    ]);
    chromeExtensionService.runtime
      .sendMessage({
        action: BROADCAST_ACTION.githubOutageCleared,
        data: null,
      })
      .catch(() => {});
  }

  async dispose(): Promise<void> {
    // No resources to clean up — flags are persisted in chrome.storage.
  }
}

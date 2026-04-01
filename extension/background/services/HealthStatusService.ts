import type { IHealthStatusService } from '../interfaces/IHealthStatusService';
import {
  STORAGE_KEY_PARSER_BREAKAGE,
  STORAGE_KEY_GITHUB_OUTAGE,
} from '../../common/constants';
import { BROADCAST_ACTION } from '../../common/runtime-actions';

/**
 * Persists and broadcasts health status flags (parser breakage, GitHub outage)
 * so the popup UI can show the appropriate banner and the background service
 * can skip redundant writes on repeated errors.
 *
 * Each flag follows the same lifecycle:
 *   1. On first error → persist to chrome.storage.local + broadcast "detected"
 *   2. On subsequent errors → no-op (in-memory flag prevents duplicate writes)
 *   3. On recovery (successful fetch) → remove from storage + broadcast "cleared"
 *
 * Parser breakage and GitHub outage are separate flags because they require
 * different user-facing messaging ("wait it out" vs "extension update incoming")
 * and different developer-facing triage.
 */
export class HealthStatusService implements IHealthStatusService {
  private parserBroken = false;
  private githubOutage = false;

  async initialize(): Promise<void> {
    const stored = await chrome.storage.local.get([
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
    await chrome.storage.local.set({ [STORAGE_KEY_PARSER_BREAKAGE]: payload });
    chrome.runtime.sendMessage({
      action: BROADCAST_ACTION.parserBreakageDetected,
      data: payload,
    }).catch(() => {});
  }

  async clearParserBreakage(): Promise<void> {
    if (!this.parserBroken) return;
    this.parserBroken = false;
    await chrome.storage.local.remove(STORAGE_KEY_PARSER_BREAKAGE);
    chrome.runtime.sendMessage({
      action: BROADCAST_ACTION.parserBreakageCleared,
      data: null,
    }).catch(() => {});
  }

  async signalGitHubOutage(context: string): Promise<void> {
    if (this.githubOutage) return;
    this.githubOutage = true;
    const payload = { detected: true, timestamp: Date.now(), context };
    await chrome.storage.local.set({ [STORAGE_KEY_GITHUB_OUTAGE]: payload });
    chrome.runtime.sendMessage({
      action: BROADCAST_ACTION.githubOutageDetected,
      data: payload,
    }).catch(() => {});
  }

  async clearGitHubOutage(): Promise<void> {
    if (!this.githubOutage) return;
    this.githubOutage = false;
    await chrome.storage.local.remove(STORAGE_KEY_GITHUB_OUTAGE);
    chrome.runtime.sendMessage({
      action: BROADCAST_ACTION.githubOutageCleared,
      data: null,
    }).catch(() => {});
  }

  async dispose(): Promise<void> {
    // No resources to clean up — flags are persisted in chrome.storage.
  }
}

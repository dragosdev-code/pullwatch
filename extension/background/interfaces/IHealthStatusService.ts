import type { IService } from './IService';

/**
 * Discriminator on the persisted outage payload. `'transport'` covers `GitHubOutageError` thrown
 * from PR fetches; `'pr_component_degraded'` covers Statuspage-derived suspicion when an empty
 * fetch coincides with a degraded Pull Requests component. The single in-memory dedupe flag is
 * preserved intentionally so the popup keeps one unified banner instead of sprouting per-reason
 * surfaces.
 */
export type GitHubOutageReason = 'transport' | 'pr_component_degraded';

/**
 * Manages cross-cutting health status signals (parser breakage, GitHub outage)
 * that are surfaced in the popup UI as banners and persisted across service
 * worker restarts via chrome.storage.local.
 */
export interface IHealthStatusService extends IService {
  signalParserBreakage(context: string): Promise<void>;
  clearParserBreakage(): Promise<void>;
  signalGitHubOutage(context: string, reason?: GitHubOutageReason): Promise<void>;
  clearGitHubOutage(): Promise<void>;
}

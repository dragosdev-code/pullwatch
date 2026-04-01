import type { IService } from './IService';

/**
 * Manages cross-cutting health status signals (parser breakage, GitHub outage)
 * that are surfaced in the popup UI as banners and persisted across service
 * worker restarts via chrome.storage.local.
 */
export interface IHealthStatusService extends IService {
  signalParserBreakage(context: string): Promise<void>;
  clearParserBreakage(): Promise<void>;
  signalGitHubOutage(context: string): Promise<void>;
  clearGitHubOutage(): Promise<void>;
}

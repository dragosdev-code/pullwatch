import type { IService } from './IService';

export type GitHubPRComponentStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'unknown';

export type GitHubGlobalIndicator = 'none' | 'minor' | 'major' | 'critical' | 'unknown';

export interface GitHubStatusSnapshot {
  prComponentStatus: GitHubPRComponentStatus;
  globalIndicator: GitHubGlobalIndicator;
  fetchedAt: number;
}

/**
 * Polls https://www.githubstatus.com/api/v2/summary.json (JSON API — not HTML scraping).
 *
 * WHY [scope in Pullwatch]: Only consulted from `PRService.isOutageSuspectedEmpty` when a PR list
 * fetch came back **empty** while storage still had PRs — to decide whether that empty result is
 * incident-correlated or safe to persist. It is **not** the signal that clears the outage banner;
 * clearing follows successful list updates from github.com (non-empty fetch bypasses the gate
 * entirely). Fail-OPEN by contract: transport / parse failure → `'unknown'` so callers default to
 * trusting the PR fetch; `GitHubOutageError` still covers hard transport failures on github.com.
 */
export interface IGitHubStatusClient extends IService {
  getStatus(): Promise<GitHubStatusSnapshot>;
}

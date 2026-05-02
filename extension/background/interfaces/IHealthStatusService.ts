import type { IService } from './IService';

/**
 * Discriminator on the persisted outage payload.
 *
 * - `'transport'`: thrown errors caught in `PrFetchErrorHandler` — network failure,
 *   `GitHubOutageError`, `ParserBreakageError`, session-invalid, rate-limit. Signaled
 *   regardless of Statuspage.
 *
 * - `'pr_component_degraded'`: local PR-list anomaly INDEPENDENTLY CORROBORATED by
 *   Statuspage — `prComponentStatus` in {`partial_outage`, `major_outage`}, OR
 *   `'unknown'` alongside a non-none / non-unknown `globalIndicator`. Also signaled
 *   for the `partial_drop_*` assessment branches (existing limbo path).
 *
 * - `'pr_list_churn'`: post-hoc integrity signal from `PrTombstoneStore` — a PR key
 *   reappeared within the 4-alarm window after disappearing from a trusted persist.
 *   INDEPENDENT OF STATUSPAGE: flapping is an integrity signal even when summary.json
 *   is green, because the assessor by itself cannot distinguish "key briefly missing"
 *   from "key never existed" once it has been pruned from `oldPRs`.
 *
 * INVARIANT: `'pr_component_degraded'` MUST NOT be signaled for a single-list
 * `empty_after_non_empty` whose Statuspage is operational, `degraded_performance`,
 * or `'unknown'` without a global incident. The legitimate-zero path stays silent
 * — confirmation is handled by `EmptyConfirmationTracker` and persists `[]` only
 * after N consecutive empties under stable viewer identity.
 *
 * The single in-memory dedupe flag in `HealthStatusService` is preserved
 * intentionally so the popup keeps one unified banner instead of sprouting
 * per-reason surfaces. Note that dedupe means a corroborated escalation that
 * fires after a prior corroborated signal does NOT update the persisted
 * `context` string — first context wins for the active outage window.
 */
export type GitHubOutageReason = 'transport' | 'pr_component_degraded' | 'pr_list_churn';

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

import {
  GITHUB_PR_COMPONENT_NAME,
  GITHUB_STATUS_API_URL,
  GITHUB_STATUS_CACHE_TTL_MS,
  GITHUB_STATUS_FETCH_TIMEOUT_MS,
  STORAGE_KEY_GITHUB_STATUS_CACHE,
} from './constants';
import type {
  GitHubGlobalIndicator,
  GitHubPRComponentStatus,
  GitHubStatusSnapshot,
  IGitHubStatusClient,
} from '../background/interfaces/IGitHubStatusClient';
import type { IDebugService } from '../background/interfaces/IDebugService';
import { chromeExtensionService } from './chrome-extension-service';

const COMPONENT_STATUSES: ReadonlySet<GitHubPRComponentStatus> = new Set([
  'operational',
  'degraded_performance',
  'partial_outage',
  'major_outage',
]);

const GLOBAL_INDICATORS: ReadonlySet<GitHubGlobalIndicator> = new Set([
  'none',
  'minor',
  'major',
  'critical',
]);

function unknownSnapshot(now: number): GitHubStatusSnapshot {
  return { prComponentStatus: 'unknown', globalIndicator: 'unknown', fetchedAt: now };
}

/**
 * Pure parser kept exported so unit tests can drive it without mocking `fetch` or storage.
 */
export function parseSummaryForPRComponent(json: unknown, now: number): GitHubStatusSnapshot {
  if (!json || typeof json !== 'object') return unknownSnapshot(now);

  const root = json as { components?: unknown; status?: unknown };

  const indicatorRaw = (root.status as { indicator?: unknown } | undefined)?.indicator;
  const globalIndicator: GitHubGlobalIndicator =
    typeof indicatorRaw === 'string' && (GLOBAL_INDICATORS as Set<string>).has(indicatorRaw)
      ? (indicatorRaw as GitHubGlobalIndicator)
      : 'unknown';

  let prComponentStatus: GitHubPRComponentStatus = 'unknown';
  if (Array.isArray(root.components)) {
    for (const component of root.components) {
      if (!component || typeof component !== 'object') continue;
      const name = (component as { name?: unknown }).name;
      if (typeof name !== 'string') continue;
      if (name.trim().toLowerCase() !== GITHUB_PR_COMPONENT_NAME) continue;
      const status = (component as { status?: unknown }).status;
      if (typeof status === 'string' && (COMPONENT_STATUSES as Set<string>).has(status)) {
        prComponentStatus = status as GitHubPRComponentStatus;
      }
      break;
    }
  }

  return { prComponentStatus, globalIndicator, fetchedAt: now };
}

interface CachedSnapshot extends GitHubStatusSnapshot {
  /** Re-asserted on read so a future shape change does not break TTL math. */
  fetchedAt: number;
}

/**
 * WHY [fail-open]: Real transport outages are caught upstream by `GitHubOutageError` from
 * GitHubService — flaky githubstatus.com must not silently *suppress* legitimate notifications by
 * masking a healthy PR fetch as "degraded". Tradeoff: a real PR-component degradation that
 * coincides with a status-API blip will not arm the gate; the existing transport-error path still
 * paints the outage banner if PR fetches fail outright.
 *
 * WHY [not lifecycle authority]: Summary.json can disagree with whether github.com already returns
 * PR rows again; `PRService` clears the outage flag when a trusted list update succeeds — see
 * `isOutageSuspectedEmpty` docs — not when this snapshot alone says “green”.
 */
export class GitHubStatusClient implements IGitHubStatusClient {
  private debugService: IDebugService;
  private initialized = false;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    // No resources — cache lives in chrome.storage.local.
  }

  async getStatus(options?: { bypassCache?: boolean }): Promise<GitHubStatusSnapshot> {
    const now = Date.now();

    if (!options?.bypassCache) {
      const cached = await this.readCache();
      if (cached && now - cached.fetchedAt < GITHUB_STATUS_CACHE_TTL_MS) {
        return cached;
      }
    }

    // WHY [bypass overwrites cache]: an alarm/manual wave prefetches once with bypassCache; the
    // subsequent same-wave per-list assess() calls must hit the refreshed cache instead of
    // re-fetching summary.json three times. Restarting the TTL from "now" is the dedupe primitive.
    const fresh = await this.fetchSnapshot(now);
    await this.writeCache(fresh);
    return fresh;
  }

  private async fetchSnapshot(now: number): Promise<GitHubStatusSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GITHUB_STATUS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(GITHUB_STATUS_API_URL, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) {
        this.debugService.warn(
          `[GitHubStatusClient] Non-OK response ${response.status} — failing open as 'unknown'.`
        );
        return unknownSnapshot(now);
      }
      const json: unknown = await response.json();
      const snapshot = parseSummaryForPRComponent(json, now);
      if (snapshot.prComponentStatus === 'unknown' && snapshot.globalIndicator !== 'unknown') {
        // WHY [drift visibility]: Logged so a renamed Statuspage component is observable from field
        // reports — gate falls back to globalIndicator until we update GITHUB_PR_COMPONENT_NAME.
        this.debugService.warn(
          `[GitHubStatusClient] Pull Requests component not found on summary.json — using global indicator '${snapshot.globalIndicator}' as fallback.`
        );
      }
      return snapshot;
    } catch (error) {
      this.debugService.warn(
        `[GitHubStatusClient] Status fetch failed — failing open as 'unknown'.`,
        error
      );
      return unknownSnapshot(now);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readCache(): Promise<CachedSnapshot | null> {
    try {
      const stored = await chromeExtensionService.storage.local.get(
        STORAGE_KEY_GITHUB_STATUS_CACHE
      );
      const raw = stored[STORAGE_KEY_GITHUB_STATUS_CACHE];
      if (!raw || typeof raw !== 'object') return null;
      const candidate = raw as Partial<CachedSnapshot>;
      if (
        typeof candidate.fetchedAt !== 'number' ||
        typeof candidate.prComponentStatus !== 'string' ||
        typeof candidate.globalIndicator !== 'string'
      ) {
        return null;
      }
      return candidate as CachedSnapshot;
    } catch {
      return null;
    }
  }

  private async writeCache(snapshot: GitHubStatusSnapshot): Promise<void> {
    try {
      await chromeExtensionService.storage.local.set({
        [STORAGE_KEY_GITHUB_STATUS_CACHE]: snapshot,
      });
    } catch (error) {
      this.debugService.warn('[GitHubStatusClient] Failed to write status cache.', error);
    }
  }
}

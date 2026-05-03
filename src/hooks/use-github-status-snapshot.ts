import { useEffect, useState } from 'react';
import { STORAGE_KEY_GITHUB_STATUS_CACHE } from '@common/constants';
import { chromeExtensionService, type StorageChange } from '@common/chrome-extension-service';

export type GitHubPRComponentStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'unknown';

export type GitHubGlobalIndicator = 'none' | 'minor' | 'major' | 'critical' | 'unknown';

export interface GitHubStatusUiSnapshot {
  prComponentStatus: GitHubPRComponentStatus;
  globalIndicator: GitHubGlobalIndicator;
  fetchedAt: number;
}

const PR_COMPONENT_STATUSES: ReadonlySet<GitHubPRComponentStatus> =
  new Set<GitHubPRComponentStatus>([
    'operational',
    'degraded_performance',
    'partial_outage',
    'major_outage',
    'unknown',
  ]);

const GLOBAL_INDICATORS: ReadonlySet<GitHubGlobalIndicator> = new Set<GitHubGlobalIndicator>([
  'none',
  'minor',
  'major',
  'critical',
  'unknown',
]);

function parseSnapshot(value: unknown): GitHubStatusUiSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GitHubStatusUiSnapshot>;
  if (typeof candidate.fetchedAt !== 'number' || !Number.isFinite(candidate.fetchedAt)) return null;
  if (typeof candidate.prComponentStatus !== 'string') return null;
  if (typeof candidate.globalIndicator !== 'string') return null;
  if (!PR_COMPONENT_STATUSES.has(candidate.prComponentStatus as GitHubPRComponentStatus)) {
    return null;
  }
  if (!GLOBAL_INDICATORS.has(candidate.globalIndicator as GitHubGlobalIndicator)) {
    return null;
  }
  return {
    prComponentStatus: candidate.prComponentStatus as GitHubPRComponentStatus,
    globalIndicator: candidate.globalIndicator as GitHubGlobalIndicator,
    fetchedAt: candidate.fetchedAt,
  };
}

/**
 * Reactive read of the cached `summary.json` snapshot the background owns. The popup never refetches
 * `githubstatus.com` itself — host permissions and TTL behavior live in `GitHubStatusClient`.
 *
 * WHY [popup-side cache only]: Used to gate the Statuspage link on the outage banner. A 2-minute-
 * stale snapshot is acceptable for an informational link; the alternative (always-on or always-off)
 * is strictly worse.
 */
export function useGitHubStatusSnapshot(): GitHubStatusUiSnapshot | null {
  const [snapshot, setSnapshot] = useState<GitHubStatusUiSnapshot | null>(null);

  useEffect(() => {
    if (!chromeExtensionService.isExtensionContext()) return;

    let cancelled = false;
    chromeExtensionService.storage.local
      .get(STORAGE_KEY_GITHUB_STATUS_CACHE)
      .then((result) => {
        if (cancelled) return;
        setSnapshot(parseSnapshot(result[STORAGE_KEY_GITHUB_STATUS_CACHE]));
      })
      .catch(() => {
        // Treat read failure as "no snapshot" — link gating defaults to hidden.
      });

    const onStorageChanged = (changes: { [key: string]: StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (!(STORAGE_KEY_GITHUB_STATUS_CACHE in changes)) return;
      const nv = changes[STORAGE_KEY_GITHUB_STATUS_CACHE].newValue;
      setSnapshot(nv === undefined ? null : parseSnapshot(nv));
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cancelled = true;
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return snapshot;
}

/**
 * True when the cached Statuspage snapshot independently corroborates a GitHub-side incident
 * affecting Pull Requests. Used by the outage banner to decide whether linking to githubstatus.com
 * would be honest for `transport`-class outages.
 */
export function hasCorroboratingStatusCache(snapshot: GitHubStatusUiSnapshot | null): boolean {
  if (!snapshot) return false;
  if (
    snapshot.prComponentStatus === 'partial_outage' ||
    snapshot.prComponentStatus === 'major_outage'
  ) {
    return true;
  }
  return (
    snapshot.globalIndicator === 'minor' ||
    snapshot.globalIndicator === 'major' ||
    snapshot.globalIndicator === 'critical'
  );
}

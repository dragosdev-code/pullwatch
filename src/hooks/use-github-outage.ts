import { useEffect, useState } from 'react';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import {
  GITHUB_OUTAGE_STALE_AFTER_MS,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
} from '@common/constants';
import { chromeExtensionService, type StorageChange } from '@common/chrome-extension-service';
import type { GitHubOutagePayload, GitHubOutageReason } from '@common/types';

const KNOWN_REASONS: ReadonlySet<GitHubOutageReason> = new Set<GitHubOutageReason>([
  'transport',
  'pr_component_degraded',
  'pr_list_churn',
]);

export type GitHubOutageUiState = {
  /** True while `STORAGE_KEY_GITHUB_OUTAGE` carries a recognised payload. */
  isActive: boolean;
  /** Authoritative reason/context/timestamp for the active outage; cleared together with `isActive`. */
  payload: GitHubOutagePayload | null;
  /**
   * Present when the outage gate recorded an empty fetch it refused to apply; cleared together with
   * the outage flag when the background reports recovery.
   */
  lastUntrustedAttemptAt: number | null;
};

function readUntrustedMs(result: Record<string, unknown>): number | null {
  const raw = result[STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * WHY [authoritative reason from storage]: The popup must branch copy on the *current* outage
 * reason, not on the first broadcast it ever saw. `HealthStatusService.signalGitHubOutage` writes
 * the same payload to both `chrome.storage.local` and the broadcast `data` field, so either source
 * is correct in isolation — but storage wins for cross-wave reason transitions because it is the
 * place the background ultimately commits to.
 *
 * WHY [legacy reason fallback]: Pre-`reason` builds persisted `{ detected, timestamp, context }`
 * without a discriminator. Until the next `clearGitHubOutage` rewrites the key, those payloads
 * would otherwise be rejected and the banner would stay hidden while the flag is still active.
 * Default to `'transport'` so the banner shows the most generic, never-over-promising copy and the
 * link stays gated by `hasCorroboratingStatusCache`.
 *
 * WHY [stale flag expiry]: Broadcasts are best-effort and a popup can mount hours after recovery.
 * `lastSeenAt` is refreshed by repeated background outage signals; if it is too old, storage is no
 * longer a reliable statement about GitHub's current state.
 */
function parsePayload(value: unknown): GitHubOutagePayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GitHubOutagePayload>;
  if (candidate.detected !== true) return null;
  if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) return null;
  if (typeof candidate.context !== 'string') return null;
  const lastSeenAt =
    typeof candidate.lastSeenAt === 'number' && Number.isFinite(candidate.lastSeenAt)
      ? candidate.lastSeenAt
      : candidate.timestamp;
  if (Date.now() - lastSeenAt > GITHUB_OUTAGE_STALE_AFTER_MS) return null;
  const reason: GitHubOutageReason =
    typeof candidate.reason === 'string' &&
    KNOWN_REASONS.has(candidate.reason as GitHubOutageReason)
      ? (candidate.reason as GitHubOutageReason)
      : 'transport';
  return {
    detected: true,
    timestamp: candidate.timestamp,
    lastSeenAt,
    context: candidate.context,
    reason,
  };
}

/**
 * Subscribes to the GitHub-outage flag and optional “untrusted empty fetch” timestamp in
 * chrome.storage.local, plus broadcast updates from the service worker.
 *
 * WHY [two fields]: Transport failures never write {@link STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT};
 * only the PRService gate does — so the banner can show an extra line only when we attempted a
 * sync but kept the cached list.
 */
export function useGitHubOutage(): GitHubOutageUiState {
  const [payload, setPayload] = useState<GitHubOutagePayload | null>(null);
  const [lastUntrustedAttemptAt, setLastUntrustedAttemptAt] = useState<number | null>(null);

  useEffect(() => {
    if (!chromeExtensionService.isExtensionContext()) return;

    let cancelled = false;
    const refreshFromStorage = () => {
      chromeExtensionService.storage.local
        .get([STORAGE_KEY_GITHUB_OUTAGE, STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT])
        .then((result) => {
          if (cancelled) return;
          const nextPayload = parsePayload(result[STORAGE_KEY_GITHUB_OUTAGE]);
          setPayload(nextPayload);
          setLastUntrustedAttemptAt(nextPayload ? readUntrustedMs(result) : null);
        })
        .catch(() => {
          // Transient storage error: keep prior UI state rather than flipping the banner off.
        });
    };

    refreshFromStorage();

    const cleanupMessage = chromeExtensionService.messages.subscribe((message) => {
      if (message.action === BROADCAST_ACTION.githubOutageDetected) {
        const parsed = parsePayload(message.data);
        if (parsed) {
          setPayload(parsed);
        } else {
          // WHY [storage fallback is safe]: `HealthStatusService.signalGitHubOutage` awaits
          // `storage.local.set` BEFORE `runtime.sendMessage`, so by the time the popup observes the
          // broadcast the storage value is already committed. A re-read here cannot race ahead of
          // the write. The `storage.onChanged` listener also fires for the same set, so even if
          // this fetch is somehow served stale (different storage area, etc.) the listener will
          // converge state on the next tick. Used today only when a signaller broadcasts without
          // a parseable `data` payload.
          refreshFromStorage();
        }
      } else if (message.action === BROADCAST_ACTION.githubOutageCleared) {
        setPayload(null);
        setLastUntrustedAttemptAt(null);
      }
    });

    const onStorageChanged = (changes: { [key: string]: StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (STORAGE_KEY_GITHUB_OUTAGE in changes) {
        const nv = changes[STORAGE_KEY_GITHUB_OUTAGE].newValue;
        // WHY [undefined → cleared]: chrome.storage.local.remove emits `newValue: undefined`. Treat
        // as a clear so a key removal flips the banner off without waiting for the broadcast.
        const nextPayload = nv === undefined ? null : parsePayload(nv);
        setPayload(nextPayload);
        if (!nextPayload) setLastUntrustedAttemptAt(null);
      }
      if (STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT in changes) {
        const nv = changes[STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT].newValue;
        setLastUntrustedAttemptAt(typeof nv === 'number' && Number.isFinite(nv) ? nv : null);
      }
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cancelled = true;
      cleanupMessage();
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return { isActive: payload !== null, payload, lastUntrustedAttemptAt };
}

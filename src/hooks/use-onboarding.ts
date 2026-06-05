import { useCallback, useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_HAS_SEEN_ONBOARDING,
  STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
} from '@common/constants';
import type { GitHubViewerIdentity, StoredPRs } from '@common/types';
import { runWithTransientStorageRetry } from '@common/transient-storage-retry';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';
import { queryKeys } from '@src/constants/query-keys';
import { isExtensionContext } from '@src/utils/is-extension-context';

export type OnboardingRefreshState = 'idle' | 'loading' | 'error';

const VIEWER_SCOPED_PR_QUERY_KEYS = [
  queryKeys.assignedPrs,
  queryKeys.mergedPrs,
  queryKeys.authoredPrs,
] as const;

function isAuthLikeErrorMessage(message: string): boolean {
  return (
    message.startsWith('NotLoggedIn') ||
    message.startsWith('AuthenticationError') ||
    message.includes('Not logged in')
  );
}

/** Shown after refresh when GitHub has no browser session Pullwatch can use (not a transport/parser failure). */
const REFRESH_NO_GITHUB_SESSION_INFO =
  'Pullwatch still does not detect a signed-in GitHub session in this browser. Finish logging in on github.com, then tap Refresh status again.';

/** Keeps the refresh control in a loading state long enough for motion design (skipped when reduced motion). */
const REFRESH_MIN_UI_MS = 850;

/**
 * Upper bound on the install-time "checking GitHub session" phase before we fall through to
 * {@link LoggedOutView}. Covers SW dead / offline / background fetch hung — 12s is a balance
 * between "long enough that a slow network still resolves here" and "short enough that a truly
 * dead SW doesn't strand the popup on a loader indefinitely".
 */
const INSTALL_CHECK_MAX_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readViewerLogin(items: Record<string, unknown>): string | null {
  const raw = items[STORAGE_KEY_GITHUB_VIEWER_IDENTITY] as GitHubViewerIdentity | undefined;
  const login = raw?.login?.trim();
  return login && login.length > 0 ? login : null;
}

const VIEWER_SCOPED_PR_STORAGE_ROWS = [
  { storageKey: STORAGE_KEY_ASSIGNED_PRS, queryKey: queryKeys.assignedPrs },
  { storageKey: STORAGE_KEY_MERGED_PRS, queryKey: queryKeys.mergedPrs },
  { storageKey: STORAGE_KEY_AUTHORED_PRS, queryKey: queryKeys.authoredPrs },
] as const;

/**
 * Re-reads the viewer-scoped PR lists from storage and applies them to the query cache.
 *
 * WHY [re-read, not blank]: On an account swap (A → B) the background swap barrier persists this
 * viewer's lists — or clears the ones that did not refresh — *before* it writes
 * `github_viewer_identity`. So by the time the identity-change event fires, storage already holds
 * B's data. Blanking the caches to `[]` here wiped those freshly synced lists and flashed all-empty
 * until the next fetch. Reading storage and applying it shows B's actual rows (or a legitimate
 * empty list) with no flash, while still never rendering A's rows.
 */
async function applyViewerScopedListsFromStorage(queryClient: QueryClient): Promise<void> {
  const keys = VIEWER_SCOPED_PR_STORAGE_ROWS.map((row) => row.storageKey);
  const snapshot = await runWithTransientStorageRetry(() =>
    chromeExtensionService.storage.local.get(keys)
  );
  for (const { storageKey, queryKey } of VIEWER_SCOPED_PR_STORAGE_ROWS) {
    const prs = (snapshot[storageKey] as StoredPRs | undefined)?.prs ?? [];
    queryClient.setQueryData(queryKey, prs);
  }
}

/**
 * WHY [single round-trip]: `set` + `remove` are fired concurrently with `Promise.all` so a
 * popup close can't land between two sequential awaits and leave storage half-written
 * (e.g. `has_seen_onboarding = true` but `reauth_gate_pending` still `true`).
 */
async function persistOnboardingDismissal(): Promise<void> {
  if (!isExtensionContext()) {
    return;
  }
  await Promise.all([
    runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.set({ [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true })
    ),
    runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.remove(STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING)
    ),
  ]);
}

/**
 * First-run onboarding + GitHub session gate for the popup.
 *
 * WHY [no pagehide persist for reveal]: Dismiss is explicit (Let's go + exit animation).
 * Closing the popup before that leaves `has_seen_onboarding` unset so the welcome returns
 * next open instead of stranding a half-seen state in storage.
 *
 * WHY [refresh mirrors header]: Same three background calls as {@link useRateLimitedRefresh}
 * (`prs.fetchFreshAssigned`, `prs.fetchFreshMerged`, `prs.fetchFreshAuthored`) so storage-backed
 * lists and `github_viewer_identity` stay consistent after onboarding refresh — not only To Review.
 *
 * WHY [reauth gate flag]: After a session wipe, `has_seen_onboarding` stays true so a returning
 * user is not treated as a brand-new install — but we still require one explicit pass through the
 * welcome overlay before lists unlock again (same as first-run).
 *
 * WHY [throughLoggedOutGate]: If this mount ever shows the logged-out gate, keep the welcome
 * overlay after login until Let's go — even when `has_seen_onboarding` is already true (session
 * wipe may not have landed yet in the same tick as storage hydration).
 */
export function useOnboarding() {
  const queryClient = useQueryClient();
  const [storageReady, setStorageReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [reauthGatePending, setReauthGatePending] = useState(false);
  /** True after this popup mount has observed a logged-out gate (survives until Let's go). */
  const [throughLoggedOutGate, setThroughLoggedOutGate] = useState(false);
  const [viewerLogin, setViewerLogin] = useState<string | null>(null);
  const [authWall, setAuthWall] = useState(false);
  const [refreshState, setRefreshState] = useState<OnboardingRefreshState>('idle');
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | null>(null);
  const [refreshInfoMessage, setRefreshInfoMessage] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  /** SW writes `true` once the install-time session probe settles (success or auth fail). */
  const [installCheckComplete, setInstallCheckComplete] = useState(false);
  /**
   * WHY [sticky, never reset]: Once the 12s install-check timeout fires and we hand off to
   * LoggedOutView, a late identity write must not yank the user back into the checking loader
   * mid-click. `isLoggedIn` flipping to `true` still lets the normal logged-out → reveal
   * crossfade happen — we only block the loggedOut → checking regression.
   */
  const [checkTimedOut, setCheckTimedOut] = useState(false);

  const markRevealComplete = useCallback(() => {
    // WHY [optimistic state]: Set React state immediately so the overlay unmounts even if
    // the popup is destroyed before chrome.storage IPC completes. On next open, hydrate()
    // reads the authoritative storage value.
    setHasSeenOnboarding(true);
    setReauthGatePending(false);
    setThroughLoggedOutGate(false);
    void (async () => {
      try {
        await persistOnboardingDismissal();
      } catch (e) {
        console.error('[useOnboarding] persistOnboardingDismissal failed', e);
      }
    })();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!isExtensionContext()) {
      setHasSeenOnboarding(true);
      setStorageReady(true);
      return;
    }

    let cancelled = false;
    /**
     * WHY [generation counter]: `onChanged` can fire while `hydrate()` is in-flight; its
     * values are strictly newer than the snapshot `hydrate` started reading. If the counter
     * advanced, skip the stale hydration writes so we don't regress state.
     *
     * WHY [local + gate keys only]: Non-`local` areas (e.g. `sync`) and unrelated `local` keys
     * (PR lists, fetch flags) must not bump the counter — otherwise hydrate would skip applying
     * a valid first snapshot for no onboarding-relevant reason.
     */
    let storageGeneration = 0;

    const hydrate = async () => {
      const readGeneration = storageGeneration;
      try {
        const result = await runWithTransientStorageRetry(() =>
          chromeExtensionService.storage.local.get([
            STORAGE_KEY_HAS_SEEN_ONBOARDING,
            STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
            STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
            STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE,
          ])
        );
        if (cancelled) return;
        // If onChanged fired while we were reading, its values are newer — skip the hydration write.
        if (storageGeneration > readGeneration) {
          setStorageReady(true);
          return;
        }
        setHasSeenOnboarding(!!result[STORAGE_KEY_HAS_SEEN_ONBOARDING]);
        setReauthGatePending(!!result[STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING]);
        setInstallCheckComplete(!!result[STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE]);
        setViewerLogin(readViewerLogin(result));
      } catch {
        if (!cancelled) {
          setHasSeenOnboarding(false);
          setViewerLogin(null);
        }
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    };

    void hydrate();

    const onStorageChanged = (
      changes: { [key: string]: StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;

      const onboardingStorageTouched =
        STORAGE_KEY_HAS_SEEN_ONBOARDING in changes ||
        STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING in changes ||
        STORAGE_KEY_GITHUB_VIEWER_IDENTITY in changes ||
        STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE in changes;
      if (onboardingStorageTouched) {
        storageGeneration += 1;
      }

      if (STORAGE_KEY_HAS_SEEN_ONBOARDING in changes) {
        setHasSeenOnboarding(!!changes[STORAGE_KEY_HAS_SEEN_ONBOARDING].newValue);
      }
      if (STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING in changes) {
        setReauthGatePending(!!changes[STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING].newValue);
      }
      if (STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE in changes) {
        setInstallCheckComplete(
          !!changes[STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE].newValue
        );
      }
      if (STORAGE_KEY_GITHUB_VIEWER_IDENTITY in changes) {
        const identityChange = changes[STORAGE_KEY_GITHUB_VIEWER_IDENTITY];
        const previousLogin = readViewerLogin({
          [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: identityChange.oldValue,
        });
        const next = identityChange.newValue;
        const nextLogin = readViewerLogin({ [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: next });
        if (previousLogin && previousLogin !== nextLogin) {
          // WHY [account boundary]: PR query keys are shared across GitHub users, while their
          // storage snapshots are viewer-scoped, so the previous viewer's rows must never linger.
          // WHY [require previousLogin]: a first login (null → login) is NOT a swap — the same
          // fetch wave persists this viewer's lists *before* the identity key, so the caches
          // already hold the correct data and must not be touched.
          if (nextLogin) {
            // Swap A → B: storage already holds B's lists (persisted before the identity write),
            // so re-read and apply them instead of blanking — never A's rows, never an empty flash.
            void applyViewerScopedListsFromStorage(queryClient).catch((e) => {
              console.error('[useOnboarding] applyViewerScopedListsFromStorage failed', e);
            });
          } else {
            // Logout A → null: no new viewer; drop A's lists so nothing stale renders behind the
            // logged-out gate.
            for (const queryKey of VIEWER_SCOPED_PR_QUERY_KEYS) {
              queryClient.setQueryData(queryKey, []);
              queryClient.removeQueries({ queryKey, exact: true, type: 'inactive' });
            }
          }
        }
        setViewerLogin(nextLogin);
        // WHY [storage-driven re-auth]: the background can repopulate `github_viewer_identity`
        // after the user signs back into GitHub; clear `authWall` whenever storage carries a login.
        if (nextLogin) {
          setAuthWall(false);
        }
      }
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cancelled = true;
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [queryClient]);

  const isLoggedIn = Boolean(!authWall && viewerLogin);

  useEffect(() => {
    if (!isExtensionContext()) return;
    if (!storageReady || isLoggedIn) return;
    setThroughLoggedOutGate(true);
  }, [storageReady, isLoggedIn]);

  const refreshGitHubSession = useCallback(async () => {
    if (!isExtensionContext()) {
      setRefreshState('idle');
      return;
    }
    setRefreshState('loading');
    setRefreshErrorMessage(null);
    setRefreshInfoMessage(null);
    const started = Date.now();
    const minUiMs = prefersReducedMotion ? 0 : REFRESH_MIN_UI_MS;
    const settleMinUi = async () => {
      const elapsed = Date.now() - started;
      const remaining = minUiMs - elapsed;
      if (remaining > 0) await sleep(remaining);
    };

    try {
      await Promise.all([
        chromeExtensionService.prs.fetchFreshAssigned(),
        chromeExtensionService.prs.fetchFreshMerged(),
        chromeExtensionService.prs.fetchFreshAuthored(),
      ]);
      const result = await runWithTransientStorageRetry(() =>
        chromeExtensionService.storage.local.get(STORAGE_KEY_GITHUB_VIEWER_IDENTITY)
      );
      const login = readViewerLogin(result);
      setAuthWall(false);
      setViewerLogin(login);
      await settleMinUi();
      if (!login) {
        setAuthWall(true);
        setRefreshInfoMessage(REFRESH_NO_GITHUB_SESSION_INFO);
      } else {
        setRefreshInfoMessage(null);
      }
      setRefreshState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthLikeErrorMessage(message)) {
        setAuthWall(true);
        setViewerLogin(null);
        await settleMinUi();
        setRefreshInfoMessage(REFRESH_NO_GITHUB_SESSION_INFO);
        setRefreshState('idle');
      } else {
        await settleMinUi();
        setRefreshInfoMessage(null);
        setRefreshErrorMessage(message);
        setRefreshState('error');
      }
    }
  }, [prefersReducedMotion]);

  /** Logged-out + first-run overlays require the real extension (storage + background); plain Vite has neither. */
  const onboardingOverlaysActive = isExtensionContext();
  /**
   * True only on a truly fresh install while the SW's `handleInstallation` fetch is still running.
   * Excludes reauth-gate returners (they already know they're out) and post-timeout fallthrough.
   */
  const initialCheckInProgress =
    !checkTimedOut &&
    storageReady &&
    !isLoggedIn &&
    !hasSeenOnboarding &&
    !reauthGatePending &&
    !installCheckComplete &&
    onboardingOverlaysActive;

  useEffect(() => {
    if (!initialCheckInProgress) return;
    const id = window.setTimeout(() => setCheckTimedOut(true), INSTALL_CHECK_MAX_MS);
    return () => window.clearTimeout(id);
  }, [initialCheckInProgress]);

  const showCheckingLayer = initialCheckInProgress;
  const showLoggedOutLayer =
    storageReady && !isLoggedIn && !initialCheckInProgress && onboardingOverlaysActive;
  const needsOnboardingReveal =
    !hasSeenOnboarding || reauthGatePending || throughLoggedOutGate;
  const showFirstRunReveal =
    storageReady &&
    isLoggedIn &&
    needsOnboardingReveal &&
    onboardingOverlaysActive;
  const gateOverlayVisible = showCheckingLayer || showLoggedOutLayer || showFirstRunReveal;
  const mainAppInert = !storageReady || gateOverlayVisible;

  return {
    storageReady,
    hasSeenOnboarding,
    isLoggedIn,
    prefersReducedMotion,
    refreshState,
    refreshErrorMessage,
    refreshInfoMessage,
    refreshGitHubSession,
    markRevealComplete,
    mainAppInert,
    gateOverlayVisible,
    showCheckingLayer,
    showLoggedOutLayer,
    showFirstRunReveal,
  };
}

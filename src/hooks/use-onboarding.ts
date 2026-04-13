import { useCallback, useEffect, useState } from 'react';
import {
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_HAS_SEEN_ONBOARDING,
  STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
} from '../../extension/common/constants';
import type { GitHubViewerIdentity } from '../../extension/common/types';
import { runWithTransientStorageRetry } from '../../extension/common/transient-storage-retry';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { isExtensionContext } from '../utils/is-extension-context';

export type OnboardingRefreshState = 'idle' | 'loading' | 'error';

function isAuthLikeErrorMessage(message: string): boolean {
  return (
    message.startsWith('NotLoggedIn') ||
    message.startsWith('AuthenticationError') ||
    message.includes('Not logged in')
  );
}

function readViewerLogin(items: Record<string, unknown>): string | null {
  const raw = items[STORAGE_KEY_GITHUB_VIEWER_IDENTITY] as GitHubViewerIdentity | undefined;
  const login = raw?.login?.trim();
  return login && login.length > 0 ? login : null;
}

async function persistHasSeenOnboarding(): Promise<void> {
  if (!isExtensionContext() || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  await runWithTransientStorageRetry(() =>
    chrome.storage.local.set({ [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true })
  );
}

async function clearOnboardingReauthGatePending(): Promise<void> {
  if (!isExtensionContext() || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  await runWithTransientStorageRetry(() =>
    chrome.storage.local.remove(STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING)
  );
}

/**
 * First-run onboarding + GitHub session gate for the popup.
 *
 * WHY [no pagehide persist for reveal]: Dismiss is explicit (Let's go + exit animation).
 * Closing the popup before that leaves `has_seen_onboarding` unset so the welcome returns
 * next open instead of stranding a half-seen state in storage.
 *
 * WHY [refresh mirrors header]: Same three background calls as {@link useRateLimitedRefresh}
 * (`fetchFreshAssignedPRs`, `fetchFreshMergedPRs`, `fetchFreshAuthoredPRs`) so storage-backed
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
  const [storageReady, setStorageReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [reauthGatePending, setReauthGatePending] = useState(false);
  /** True after this popup mount has observed a logged-out gate (survives until Let's go). */
  const [throughLoggedOutGate, setThroughLoggedOutGate] = useState(false);
  const [viewerLogin, setViewerLogin] = useState<string | null>(null);
  const [authWall, setAuthWall] = useState(false);
  const [refreshState, setRefreshState] = useState<OnboardingRefreshState>('idle');
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const markRevealComplete = useCallback(() => {
    void (async () => {
      try {
        await persistHasSeenOnboarding();
        await clearOnboardingReauthGatePending();
      } catch (e) {
        console.error('[useOnboarding] persist has_seen_onboarding failed', e);
      } finally {
        setHasSeenOnboarding(true);
        setReauthGatePending(false);
        setThroughLoggedOutGate(false);
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
    if (!isExtensionContext() || typeof chrome === 'undefined' || !chrome.storage?.local) {
      setHasSeenOnboarding(true);
      setStorageReady(true);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      try {
        const result = await runWithTransientStorageRetry(() =>
          chrome.storage.local.get([
            STORAGE_KEY_HAS_SEEN_ONBOARDING,
            STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
            STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
          ])
        );
        if (cancelled) return;
        setHasSeenOnboarding(!!result[STORAGE_KEY_HAS_SEEN_ONBOARDING]);
        setReauthGatePending(!!result[STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING]);
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
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local') return;
      if (STORAGE_KEY_HAS_SEEN_ONBOARDING in changes) {
        setHasSeenOnboarding(!!changes[STORAGE_KEY_HAS_SEEN_ONBOARDING].newValue);
      }
      if (STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING in changes) {
        setReauthGatePending(!!changes[STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING].newValue);
      }
      if (STORAGE_KEY_GITHUB_VIEWER_IDENTITY in changes) {
        const next = changes[STORAGE_KEY_GITHUB_VIEWER_IDENTITY].newValue;
        const nextLogin = readViewerLogin({ [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: next });
        setViewerLogin(nextLogin);
        // WHY [storage-driven re-auth]: the background can repopulate `github_viewer_identity`
        // after the user signs back into GitHub; clear `authWall` whenever storage carries a login.
        if (nextLogin) {
          setAuthWall(false);
        }
      }
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cancelled = true;
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(onStorageChanged);
      }
    };
  }, []);

  const isLoggedIn = Boolean(!authWall && viewerLogin);

  useEffect(() => {
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
    try {
      await Promise.all([
        chromeExtensionService.fetchFreshAssignedPRs(),
        chromeExtensionService.fetchFreshMergedPRs(),
        chromeExtensionService.fetchFreshAuthoredPRs(),
      ]);
      const result = await runWithTransientStorageRetry(() =>
        chrome.storage.local.get(STORAGE_KEY_GITHUB_VIEWER_IDENTITY)
      );
      const login = readViewerLogin(result);
      setAuthWall(false);
      setViewerLogin(login);
      if (!login) {
        setAuthWall(true);
      }
      setRefreshState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthLikeErrorMessage(message)) {
        setAuthWall(true);
        setViewerLogin(null);
        setRefreshState('idle');
      } else {
        setRefreshErrorMessage(message);
        setRefreshState('error');
      }
    }
  }, []);

  const showLoggedOutLayer = storageReady && !isLoggedIn;
  const needsOnboardingReveal =
    !hasSeenOnboarding || reauthGatePending || throughLoggedOutGate;
  const showFirstRunReveal = storageReady && isLoggedIn && needsOnboardingReveal;
  const gateOverlayVisible = showLoggedOutLayer || showFirstRunReveal;
  const mainAppInert = !storageReady || gateOverlayVisible;

  return {
    storageReady,
    hasSeenOnboarding,
    isLoggedIn,
    prefersReducedMotion,
    refreshState,
    refreshErrorMessage,
    refreshGitHubSession,
    markRevealComplete,
    mainAppInert,
    gateOverlayVisible,
    showLoggedOutLayer,
    showFirstRunReveal,
  };
}

import { useCallback, useEffect, useState } from 'react';
import {
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_HAS_SEEN_ONBOARDING,
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
 */
export function useOnboarding() {
  const [storageReady, setStorageReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [viewerLogin, setViewerLogin] = useState<string | null>(null);
  const [authWall, setAuthWall] = useState(false);
  const [refreshState, setRefreshState] = useState<OnboardingRefreshState>('idle');
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const markRevealComplete = useCallback(() => {
    void (async () => {
      try {
        await persistHasSeenOnboarding();
      } catch (e) {
        console.error('[useOnboarding] persist has_seen_onboarding failed', e);
      } finally {
        setHasSeenOnboarding(true);
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
          ])
        );
        if (cancelled) return;
        setHasSeenOnboarding(!!result[STORAGE_KEY_HAS_SEEN_ONBOARDING]);
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
      if (STORAGE_KEY_GITHUB_VIEWER_IDENTITY in changes) {
        const next = changes[STORAGE_KEY_GITHUB_VIEWER_IDENTITY].newValue;
        setViewerLogin(readViewerLogin({ [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: next }));
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
  const showFirstRunReveal = storageReady && isLoggedIn && !hasSeenOnboarding;
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

import { memo, useCallback, useId } from 'react';
import FocusLock from 'react-focus-lock';
import { GITHUB_BASE_URL } from '../../../extension/common/constants';
import { isExtensionContext } from '../../utils/is-extension-context';
import type { OnboardingRefreshState } from '../../hooks/use-onboarding';
import {
  ONBOARDING_IRIDESCENT_ROOT_STYLE,
  ONBOARDING_TEXT_MUTED,
  ONBOARDING_TEXT_PRIMARY,
  ONBOARDING_TEXT_SOFT,
} from './onboarding-iridescent-styles';

export type LoggedOutViewProps = {
  refreshState: OnboardingRefreshState;
  refreshErrorMessage: string | null;
  onRefresh: () => void;
};

const LOGIN_URL = `${GITHUB_BASE_URL}/login`;

/**
 * Premium empty state for missing GitHub session — not an error screen.
 * WHY [hardcoded theme]: DaisyUI `data-theme` must not tint this surface; marketing-grade
 * gradient + text colors are fixed here so the overlay stays on-brand regardless of settings.
 */
export const LoggedOutView = memo(function LoggedOutView({
  refreshState,
  refreshErrorMessage,
  onRefresh,
}: LoggedOutViewProps) {
  const titleId = useId();
  const liveId = useId();

  const openGitHubLogin = useCallback(() => {
    if (isExtensionContext() && chrome.tabs?.create) {
      chrome.tabs.create({ url: LOGIN_URL, active: true });
      return;
    }
    window.open(LOGIN_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const busy = refreshState === 'loading';

  return (
    <FocusLock returnFocus autoFocus>
      <div
        className="absolute inset-0 z-50 flex flex-col items-stretch justify-center px-6 py-7 text-center"
        style={ONBOARDING_IRIDESCENT_ROOT_STYLE}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div aria-live="polite" id={liveId} className="sr-only">
          {busy
            ? 'Checking GitHub session'
            : refreshErrorMessage
              ? `Refresh failed: ${refreshErrorMessage}`
              : ''}
        </div>

        <div className="mx-auto flex max-w-[300px] flex-col items-center gap-5">
          <img
            src="/logo.png"
            alt=""
            width={72}
            height={72}
            className="h-[72px] w-[72px] shrink-0 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
            decoding="async"
          />

          <div className="flex flex-col gap-2">
            <h1
              id={titleId}
              className="text-[1.35rem] font-semibold leading-tight tracking-tight"
              style={{ color: ONBOARDING_TEXT_PRIMARY }}
            >
              Sign in to GitHub
            </h1>
            <p className="text-[13px] leading-relaxed" style={{ color: ONBOARDING_TEXT_MUTED }}>
              Pullwatch reads your PR lists from your logged-in GitHub session in the browser — no
              tokens to paste, no OAuth dance in the popup.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={openGitHubLogin}
              className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-[transform,box-shadow] duration-200 hover:brightness-[1.03] active:scale-[0.99]"
              style={{
                background: 'linear-gradient(135deg, #2f2f2f 0%, #1a1a1a 100%)',
                color: '#fafafa',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              Login in GitHub
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className="flex h-10 w-full cursor-pointer items-center justify-center rounded-xl text-[12px] font-medium transition-opacity disabled:cursor-wait disabled:opacity-60"
              style={{
                color: ONBOARDING_TEXT_PRIMARY,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
              }}
            >
              {busy ? 'Checking session…' : 'Refresh status'}
            </button>
          </div>

          {refreshErrorMessage ? (
            <p className="text-left text-[11px] leading-snug" style={{ color: '#ffb4b4' }}>
              {refreshErrorMessage}
            </p>
          ) : (
            <p className="text-[11px] leading-snug" style={{ color: ONBOARDING_TEXT_SOFT }}>
              After signing in on github.com, return here and tap Refresh status.
            </p>
          )}
        </div>
      </div>
    </FocusLock>
  );
});

import { memo, useCallback, useId, useMemo } from 'react';
import { animated, useTransition } from '@react-spring/web';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { GITHUB_BASE_URL } from '../../../extension/common/constants';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { isExtensionContext } from '../../utils/is-extension-context';
import type { OnboardingRefreshState } from '../../hooks/use-onboarding';
import {
  ONBOARDING_TEXT_MUTED,
  ONBOARDING_TEXT_PRIMARY,
  ONBOARDING_TEXT_SOFT,
} from './onboarding-iridescent-styles';

export type LoggedOutViewProps = {
  refreshState: OnboardingRefreshState;
  refreshErrorMessage: string | null;
  refreshInfoMessage: string | null;
  prefersReducedMotion: boolean;
  onRefresh: () => void;
  /**
   * Set by the onboarding shell only when this panel is the active phase, so
   * `aria-labelledby` on the shared dialog resolves to exactly one heading
   * during a crossfade.
   */
  titleId?: string;
};

const LOGIN_URL = `${GITHUB_BASE_URL}/login`;

const HINT_AFTER_SIGN_IN = 'After logging in on github.com, return here and tap Refresh status.';

type FeedbackSlot = {
  key: string;
  tone: 'error' | 'info' | 'hint';
  text: string;
};

/**
 * Premium empty state for missing GitHub session — not an error screen.
 * WHY [hardcoded theme]: DaisyUI `data-theme` must not tint this surface; marketing-grade
 * gradient + text colors are fixed here so the overlay stays on-brand regardless of settings.
 */
export const LoggedOutView = memo(function LoggedOutView({
  refreshState,
  refreshErrorMessage,
  refreshInfoMessage,
  prefersReducedMotion,
  onRefresh,
  titleId,
}: LoggedOutViewProps) {
  const liveId = useId();

  const openGitHubLogin = useCallback(() => {
    if (isExtensionContext()) {
      void chromeExtensionService.tabs.create({ url: LOGIN_URL, active: true });
      return;
    }
    window.open(LOGIN_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const busy = refreshState === 'loading';

  const feedbackSlot = useMemo<FeedbackSlot>(() => {
    if (refreshErrorMessage) {
      return { key: `err:${refreshErrorMessage}`, tone: 'error', text: refreshErrorMessage };
    }
    if (refreshInfoMessage) {
      return { key: `info:${refreshInfoMessage}`, tone: 'info', text: refreshInfoMessage };
    }
    return { key: 'hint', tone: 'hint', text: HINT_AFTER_SIGN_IN };
  }, [refreshErrorMessage, refreshInfoMessage]);

  const motionOff = prefersReducedMotion;
  const feedbackTransitions = useTransition([feedbackSlot], {
    keys: (item) => item.key,
    from: motionOff ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    enter: motionOff
      ? { opacity: 1, y: 0, config: { duration: 0 } }
      : { opacity: 1, y: 0, config: { tension: 200, friction: 24 } },
    leave: motionOff
      ? { opacity: 1, y: 0, config: { duration: 0 } }
      : { opacity: 0, y: -6, config: { tension: 320, friction: 32 } },
    trail: 0,
  });

  return (
    <div className="flex h-full w-full flex-col items-stretch justify-center px-6 py-7 text-center">
      <div aria-live="polite" id={liveId} className="sr-only">
        {busy
          ? 'Checking GitHub session'
          : refreshErrorMessage
            ? `Refresh failed: ${refreshErrorMessage}`
            : refreshInfoMessage
              ? refreshInfoMessage
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
            You&apos;re signed out of GitHub
          </h1>
          <p className="text-[13px] leading-relaxed" style={{ color: ONBOARDING_TEXT_MUTED }}>
            Pullwatch reads your PR lists from your logged-in GitHub session in the browser. No
            tokens to paste, no OAuth dance in the popup.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-3 pt-1">
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
            Log in to GitHub
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            aria-busy={busy}
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-200 hover:bg-white/6 disabled:cursor-wait disabled:opacity-60"
            style={{ color: ONBOARDING_TEXT_MUTED }}
          >
            <ArrowPathIcon
              aria-hidden
              strokeWidth={2.25}
              className={`h-3.5 w-3.5 ${busy && !motionOff ? 'animate-spin' : ''}`}
            />
            <span>{busy ? 'Checking session…' : 'Refresh status'}</span>
          </button>

          <div className="grid min-h-[62px] w-full *:col-start-1 *:row-start-1">
            {feedbackTransitions((style, item) => {
              const toneColor =
                item.tone === 'error'
                  ? '#ffb4b4'
                  : item.tone === 'info'
                    ? 'rgba(255, 220, 188, 0.95)'
                    : ONBOARDING_TEXT_SOFT;
              return (
                <animated.p
                  className="inline-flex items-start justify-center gap-1.5 px-1 text-center text-[11px] leading-snug"
                  style={{ ...style, color: toneColor }}
                >
                  {item.tone !== 'hint' ? (
                    <span
                      aria-hidden
                      className="mt-[5px] h-1 w-1 shrink-0 rounded-full"
                      style={{ background: 'currentColor' }}
                    />
                  ) : null}
                  <span>{item.text}</span>
                </animated.p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

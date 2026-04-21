import { useEffect, useId, useRef } from 'react';
import FocusLock from 'react-focus-lock';
import { animated, to, useTransition } from '@react-spring/web';
import type { OnboardingRefreshState } from '../../hooks/use-onboarding';
import { CheckingView } from './checking-view';
import { LoggedOutView } from './logged-out-view';
import { OnboardingReveal } from './onboarding-reveal';
import { ONBOARDING_IRIDESCENT_ROOT_STYLE } from './onboarding-iridescent-styles';

export type OnboardingPhase = 'checking' | 'loggedOut' | 'reveal';

export type OnboardingOverlayProps = {
  phase: OnboardingPhase;
  prefersReducedMotion: boolean;
  refreshState: OnboardingRefreshState;
  refreshErrorMessage: string | null;
  refreshInfoMessage: string | null;
  onRefresh: () => void;
  onRevealComplete: () => void;
};

const CROSSFADE_CONFIG = { tension: 220, friction: 28, clamp: false } as const;

/**
 * Single onboarding shell — one FocusLock, one dialog, one iridescent root —
 * that crossfades between the logged-out and welcome panels when `isLoggedIn`
 * flips. Replaces the previous unmount/mount swap of two independent overlays
 * that produced a visible flash even though the state change was correct.
 *
 * WHY [shellRef → OnboardingReveal]: the iris mask that clears the view on
 * "Let's go" mutates `maskImage` on the element that covers the app. With the
 * dialog hoisted here, that host is this shell — not the reveal's own root.
 *
 * WHY [entranceStyle from previous phase]: cold-open into `reveal` deserves
 * the full staggered trail; arriving via crossfade from `loggedOut` should
 * feel like one handoff, not two competing entrances.
 */
export function OnboardingOverlay({
  phase,
  prefersReducedMotion,
  refreshState,
  refreshErrorMessage,
  refreshInfoMessage,
  onRefresh,
  onRevealComplete,
}: OnboardingOverlayProps) {
  const titleId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef<OnboardingPhase | null>(null);
  // WHY [checking counts as prior screen]: a checking → reveal handoff should feel like one
  // continuous moment (not a second grand entrance), matching the loggedOut → reveal behavior.
  const revealEntranceStyle: 'full' | 'subtle' =
    (prevPhaseRef.current === 'loggedOut' || prevPhaseRef.current === 'checking') &&
    phase === 'reveal'
      ? 'subtle'
      : 'full';

  useEffect(() => {
    prevPhaseRef.current = phase;
  }, [phase]);

  const motionOff = prefersReducedMotion;
  const transitions = useTransition(phase, {
    keys: (p) => p,
    from: { opacity: 0, scale: 0.985, y: 6 },
    enter: { opacity: 1, scale: 1, y: 0 },
    leave: { opacity: 0, scale: 0.992, y: -4 },
    config: CROSSFADE_CONFIG,
    immediate: motionOff,
    exitBeforeEnter: false,
  });

  return (
    <FocusLock returnFocus autoFocus>
      <div
        ref={shellRef}
        className="absolute inset-0 z-50 overflow-hidden"
        style={ONBOARDING_IRIDESCENT_ROOT_STYLE}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {transitions((style, p) => {
          const isActive = p === phase;
          return (
            <animated.div
              className="absolute inset-0"
              style={{
                opacity: style.opacity,
                transform: to(
                  [style.y, style.scale],
                  (y, s) => `translateY(${y}px) scale(${s})`
                ),
                willChange: 'opacity, transform',
              }}
            >
              {p === 'checking' ? (
                <CheckingView
                  prefersReducedMotion={prefersReducedMotion}
                  titleId={isActive ? titleId : undefined}
                />
              ) : p === 'loggedOut' ? (
                <LoggedOutView
                  refreshState={refreshState}
                  refreshErrorMessage={refreshErrorMessage}
                  refreshInfoMessage={refreshInfoMessage}
                  prefersReducedMotion={prefersReducedMotion}
                  onRefresh={onRefresh}
                  titleId={isActive ? titleId : undefined}
                />
              ) : (
                <OnboardingReveal
                  reducedMotion={prefersReducedMotion}
                  onRevealComplete={onRevealComplete}
                  shellRef={shellRef}
                  entranceStyle={revealEntranceStyle}
                  titleId={isActive ? titleId : undefined}
                />
              )}
            </animated.div>
          );
        })}
      </div>
    </FocusLock>
  );
}

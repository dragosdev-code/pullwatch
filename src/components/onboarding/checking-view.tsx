import { memo, useId } from 'react';
import { animated, useSpring, useTrail } from '@react-spring/web';
import {
  ONBOARDING_TEXT_MUTED,
  ONBOARDING_TEXT_PRIMARY,
  ONBOARDING_TEXT_SOFT,
} from './onboarding-iridescent-styles';

export type CheckingViewProps = {
  prefersReducedMotion: boolean;
  titleId?: string;
};

const DOT_COUNT = 3;

/**
 * Install-time "checking GitHub session" phase for the onboarding overlay.
 *
 * WHY [distinct from refresh spinner]: LoggedOutView's Refresh button already uses
 * `ArrowPathIcon + animate-spin` for user-initiated checks. This phase is the system
 * probing session state on first install — it should read as a calm "we're on it"
 * moment, not a recycled mini-spinner. The breathing logo + orbiting luminous ring
 * + staggered-dot trail keep the tone on-brand with the iridescent shell.
 *
 * WHY [parent owns dialog + FocusLock]: OnboardingOverlay wraps every phase in the
 * same FocusLock and dialog role, so this panel stays declarative and focus-neutral
 * (no interactive elements = nothing to lock onto, which is intentional).
 */
export const CheckingView = memo(function CheckingView({
  prefersReducedMotion,
  titleId,
}: CheckingViewProps) {
  const liveId = useId();
  const motionOff = prefersReducedMotion;

  const breathing = useSpring({
    from: { scale: 1, opacity: 0.94 },
    to: { scale: 1.03, opacity: 1 },
    loop: { reverse: true },
    config: { tension: 140, friction: 22 },
    immediate: motionOff,
  });

  const dots = useTrail(DOT_COUNT, {
    from: { opacity: 0.22 },
    to: { opacity: 1 },
    loop: { reverse: true },
    config: { tension: 220, friction: 24 },
    immediate: motionOff,
  });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 py-7 text-center">
      <div aria-live="polite" id={liveId} className="sr-only">
        Checking your GitHub session
      </div>

      <div className="mx-auto flex max-w-[300px] flex-col items-center gap-5">
        <div className="relative flex h-[104px] w-[104px] items-center justify-center">
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-full ${
              motionOff ? '' : 'animate-[spin_2.2s_linear_infinite]'
            }`}
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0%, transparent 66%, rgba(255,255,255,0.55) 84%, rgba(255,210,190,0.78) 94%, transparent 100%)',
              maskImage:
                'radial-gradient(circle, transparent 56%, black 66%, black 84%, transparent 94%)',
              WebkitMaskImage:
                'radial-gradient(circle, transparent 56%, black 66%, black 84%, transparent 94%)',
              willChange: motionOff ? undefined : 'transform',
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[14%] rounded-2xl"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255, 210, 190, 0.22) 0%, transparent 70%)',
              filter: 'blur(6px)',
            }}
          />
          <animated.img
            src="/logo.png"
            alt=""
            width={72}
            height={72}
            decoding="async"
            className="relative h-[72px] w-[72px] shrink-0 rounded-2xl shadow-[0_14px_48px_rgba(0,0,0,0.38)]"
            style={{
              transform: breathing.scale.to((s) => `scale(${s})`),
              opacity: breathing.opacity,
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h1
            id={titleId}
            className="text-[1.35rem] font-semibold leading-tight tracking-tight"
            style={{ color: ONBOARDING_TEXT_PRIMARY }}
          >
            Checking your GitHub session
          </h1>
          <p className="text-[13px] leading-relaxed" style={{ color: ONBOARDING_TEXT_MUTED }}>
            Hang tight while Pullwatch checks your github's browser session.
          </p>
        </div>

        <div aria-hidden className="flex items-center gap-1.5 pt-1">
          {dots.map((style, i) => (
            <animated.span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ ...style, background: ONBOARDING_TEXT_SOFT }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

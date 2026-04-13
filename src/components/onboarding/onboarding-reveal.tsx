import { animated, config, useTrail } from '@react-spring/web';
import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import FocusLock from 'react-focus-lock';
import {
  ONBOARDING_IRIDESCENT_ROOT_STYLE,
  ONBOARDING_TEXT_MUTED,
  ONBOARDING_TEXT_PRIMARY,
} from './onboarding-iridescent-styles';

const REVEAL_STEPS = 4;
const LAST_STEP = REVEAL_STEPS - 1;

/** Ease-out cubic — ends softly as the iris reaches the frame edge. */
function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export type OnboardingRevealProps = {
  reducedMotion: boolean;
  onRevealComplete: () => void;
};

/**
 * One-time staggered entrance for first install after a resolved GitHub viewer.
 * WHY [FocusLock]: Tab must stay in the overlay until the user dismisses — the list beneath
 * is still mounted (React Query cache) but must not be reachable.
 *
 * WHY [rAF mask exit, not react-spring on mask-image]: Browsers do not interpolate
 * `radial-gradient()` mask strings the way they interpolate lengths; react-spring updating
 * that string each frame often produces no visible motion in Chromium (especially extension
 * popups), while `onRest` / timeouts still fire — so the UI vanished with no perceived animation.
 * A manual `requestAnimationFrame` loop assigns a new gradient each frame so every paint carries
 * an updated hole radius (same outward iris as before: transparent disc grows from the CTA).
 */
export const OnboardingReveal = memo(function OnboardingReveal({
  reducedMotion,
  onRevealComplete,
}: OnboardingRevealProps) {
  const titleId = useId();
  const liveId = useId();
  const completeOnceRef = useRef(false);
  const exitStartedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const exitBackupIdRef = useRef(0);
  const exitRafRef = useRef(0);
  const [isExitAnimating, setIsExitAnimating] = useState(false);

  useEffect(() => {
    return () => {
      if (exitBackupIdRef.current) window.clearTimeout(exitBackupIdRef.current);
      if (exitRafRef.current) cancelAnimationFrame(exitRafRef.current);
    };
  }, []);

  const finish = useCallback(() => {
    if (exitBackupIdRef.current) {
      window.clearTimeout(exitBackupIdRef.current);
      exitBackupIdRef.current = 0;
    }
    if (exitRafRef.current) {
      cancelAnimationFrame(exitRafRef.current);
      exitRafRef.current = 0;
    }
    if (completeOnceRef.current) return;
    completeOnceRef.current = true;
    onRevealComplete();
  }, [onRevealComplete]);

  const applyIrisMask = useCallback((el: HTMLDivElement, cx: number, cy: number, holeRadiusPx: number) => {
    const inner = Math.max(0, holeRadiusPx);
    const outer = inner + 2;
    const g = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${inner}px, black ${outer}px)`;
    el.style.maskImage = g;
    el.style.webkitMaskImage = g;
    el.style.maskSize = '100% 100%';
    el.style.maskRepeat = 'no-repeat';
    el.style.maskPosition = '0 0';
    el.style.webkitMaskSize = '100% 100%';
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.webkitMaskPosition = '0 0';
  }, []);

  const clearIrisMask = useCallback((el: HTMLDivElement) => {
    el.style.maskImage = '';
    el.style.webkitMaskImage = '';
  }, []);

  const handleLetsGo = useCallback(() => {
    if (exitStartedRef.current || completeOnceRef.current) return;
    exitStartedRef.current = true;
    setIsExitAnimating(true);

    const root = rootRef.current;
    const btn = ctaRef.current;
    if (!root || !btn) {
      finish();
      return;
    }

    const rr = root.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const cx = br.left + br.width / 2 - rr.left;
    const cy = br.top + br.height / 2 - rr.top;
    const maxR =
      Math.max(
        Math.hypot(cx, cy),
        Math.hypot(rr.width - cx, cy),
        Math.hypot(cx, rr.height - cy),
        Math.hypot(rr.width - cx, rr.height - cy),
      ) + 8;

    const durationMs = reducedMotion ? 160 : 580;
    if (exitBackupIdRef.current) window.clearTimeout(exitBackupIdRef.current);
    exitBackupIdRef.current = window.setTimeout(() => finish(), durationMs + 450);

    applyIrisMask(root, cx, cy, 0);

    let startMs: number | null = null;
    const step = (now: number) => {
      if (completeOnceRef.current) return;
      if (startMs === null) startMs = now;
      const raw = (now - startMs) / durationMs;
      const u = Math.min(1, raw);
      const eased = easeOutCubic(u);
      applyIrisMask(root, cx, cy, eased * maxR);
      if (u < 1) {
        exitRafRef.current = requestAnimationFrame(step);
      } else {
        exitRafRef.current = 0;
        clearIrisMask(root);
        finish();
      }
    };
    exitRafRef.current = requestAnimationFrame(step);
  }, [applyIrisMask, clearIrisMask, finish, reducedMotion]);

  const [springs] = useTrail(
    REVEAL_STEPS,
    (i) => ({
      from: { opacity: 0, transform: 'translateY(14px)' },
      to: { opacity: 1, transform: 'translateY(0px)' },
      immediate: reducedMotion,
      config: config.gentle,
      onRest: () => {
        if (reducedMotion) return;
        if (i === LAST_STEP) {
          ctaRef.current?.focus({ preventScroll: true });
        }
      },
    }),
    [reducedMotion],
  );

  return (
    <FocusLock returnFocus autoFocus>
      <div
        ref={rootRef}
        className="absolute inset-0 z-50 flex flex-col items-center justify-center px-6 py-8"
        style={ONBOARDING_IRIDESCENT_ROOT_STYLE}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div aria-live="polite" id={liveId} className="sr-only">
          Welcome to Pullwatch. Use the Let&apos;s go button when you are ready to open the app.
        </div>

        <div className="mx-auto flex max-w-[300px] flex-col items-center gap-4 text-center">
          <animated.div style={springs[0]} className="flex justify-center">
            <img
              src="/logo.png"
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 rounded-2xl shadow-[0_14px_48px_rgba(0,0,0,0.38)]"
              decoding="async"
            />
          </animated.div>

          <animated.div style={springs[1]} className="flex flex-col gap-1.5">
            <h1
              id={titleId}
              className="text-[1.45rem] font-semibold leading-tight tracking-tight"
              style={{ color: ONBOARDING_TEXT_PRIMARY }}
            >
              You&apos;re in
            </h1>
          </animated.div>

          <animated.p
            className="text-[13px] leading-relaxed"
            style={{
              opacity: springs[2].opacity,
              transform: springs[2].transform,
              color: ONBOARDING_TEXT_MUTED,
            }}
          >
            Pullwatch is synced with your GitHub session. Your lists update quietly in the
            background — open this popup whenever you want the live view.
          </animated.p>

          <animated.div style={springs[3]} className="flex justify-center">
            <button
              ref={ctaRef}
              type="button"
              onClick={handleLetsGo}
              disabled={isExitAnimating}
              aria-busy={isExitAnimating}
              className="min-h-[40px] cursor-pointer rounded-full px-6 text-[12px] font-semibold tracking-wide shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-[filter] duration-150 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:pointer-events-none disabled:opacity-70"
              style={{
                color: ONBOARDING_TEXT_PRIMARY,
                background:
                  'linear-gradient(145deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)',
                border: '1px solid rgba(255,255,255,0.28)',
              }}
            >
              Let&apos;s go
            </button>
          </animated.div>
        </div>
      </div>
    </FocusLock>
  );
});

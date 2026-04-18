import { animated, config, useTrail } from '@react-spring/web';
import type { RefObject } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ONBOARDING_TEXT_MUTED, ONBOARDING_TEXT_PRIMARY } from './onboarding-iridescent-styles';

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
  /**
   * The onboarding shell element that hosts the iridescent surface; the iris
   * exit mask is applied here so the clip reveals the underlying app instead
   * of leaving the shared shell painted behind this panel.
   */
  shellRef: RefObject<HTMLDivElement | null>;
  /**
   * `full` plays the staggered trail (cold open into reveal); `subtle` skips
   * the stagger so a crossfade from the logged-out panel doesn't read as two
   * competing entrances.
   */
  entranceStyle?: 'full' | 'subtle';
  /** Assigned by the shell only while this panel is the active phase — see OnboardingOverlay. */
  titleId?: string;
};

/**
 * One-time staggered entrance for first install after a resolved GitHub viewer.
 *
 * WHY [rAF mask exit, not react-spring on mask-image]: Browsers do not interpolate
 * `radial-gradient()` mask strings the way they interpolate lengths; react-spring updating
 * that string each frame often produces no visible motion in Chromium (especially extension
 * popups), while `onRest` / timeouts still fire — so the UI vanished with no perceived animation.
 * A manual `requestAnimationFrame` loop assigns a new gradient each frame so every paint carries
 * an updated hole radius (same outward iris as before: transparent disc grows from the CTA).
 *
 * WHY [iris on shellRef, not a local root]: The shared onboarding shell owns the dialog element
 * and the iridescent backdrop. Applying the mask to this panel's own wrapper would leave the
 * shell's surface painted over the app after the clip completes.
 */
export const OnboardingReveal = memo(function OnboardingReveal({
  reducedMotion,
  onRevealComplete,
  shellRef,
  entranceStyle = 'full',
  titleId,
}: OnboardingRevealProps) {
  const completeOnceRef = useRef(false);
  const exitStartedRef = useRef(false);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const exitBackupIdRef = useRef(0);
  const exitRafRef = useRef(0);
  const [isExitAnimating, setIsExitAnimating] = useState(false);

  const skipTrail = reducedMotion || entranceStyle === 'subtle';

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

  const applyIrisMask = useCallback(
    (el: HTMLDivElement, cx: number, cy: number, holeRadiusPx: number) => {
      const inner = Math.max(0, holeRadiusPx);
      const outer = inner + 2;
      const g = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${inner}px, black ${outer}px)`;
      el.style.maskImage = g;
      el.style.webkitMaskImage = g;
    },
    []
  );

  /** WHY [once, not per-frame]: These values never change — setting them on every rAF frame wastes style recalcs. */
  const initIrisMaskStatics = useCallback((el: HTMLDivElement) => {
    el.style.maskSize = '100% 100%';
    el.style.maskRepeat = 'no-repeat';
    el.style.maskPosition = '0 0';
    el.style.webkitMaskSize = '100% 100%';
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.webkitMaskPosition = '0 0';
  }, []);

  const handleLetsGo = useCallback(() => {
    if (exitStartedRef.current || completeOnceRef.current) return;
    exitStartedRef.current = true;
    setIsExitAnimating(true);

    const shell = shellRef.current;
    const btn = ctaRef.current;
    if (!shell || !btn) {
      finish();
      return;
    }

    const rr = shell.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const cx = br.left + br.width / 2 - rr.left;
    const cy = br.top + br.height / 2 - rr.top;
    const maxR =
      Math.max(
        Math.hypot(cx, cy),
        Math.hypot(rr.width - cx, cy),
        Math.hypot(cx, rr.height - cy),
        Math.hypot(rr.width - cx, rr.height - cy)
      ) + 8;

    const durationMs = reducedMotion ? 200 : 1000;
    if (exitBackupIdRef.current) window.clearTimeout(exitBackupIdRef.current);
    exitBackupIdRef.current = window.setTimeout(() => finish(), durationMs + 450);

    initIrisMaskStatics(shell);
    applyIrisMask(shell, cx, cy, 0);

    let startMs: number | null = null;
    const step = (now: number) => {
      if (completeOnceRef.current) return;
      if (startMs === null) startMs = now;
      const raw = (now - startMs) / durationMs;
      const u = Math.min(1, raw);
      const eased = easeOutCubic(u);
      applyIrisMask(shell, cx, cy, eased * maxR);
      if (u < 1) {
        exitRafRef.current = requestAnimationFrame(step);
      } else {
        exitRafRef.current = 0;
        // WHY [no clearIrisMask here]: Clearing the mask restores a full opaque overlay for at
        // least one paint before React commits `onRevealComplete` — that reads as a one-frame
        // "flash back". Unmount drops the node (and inline mask styles) without that frame.
        finish();
      }
    };
    exitRafRef.current = requestAnimationFrame(step);
  }, [applyIrisMask, finish, initIrisMaskStatics, reducedMotion, shellRef]);

  const [springs] = useTrail(
    REVEAL_STEPS,
    (i) => ({
      from: { opacity: 0, transform: 'translateY(14px)' },
      to: { opacity: 1, transform: 'translateY(0px)' },
      immediate: skipTrail,
      config: config.gentle,
      onRest: () => {
        if (skipTrail) return;
        if (i === LAST_STEP) {
          ctaRef.current?.focus({ preventScroll: true });
        }
      },
    }),
    [skipTrail]
  );

  // WHY [explicit focus on skipTrail]: The trail's onRest is the normal path to focus the CTA,
  // but `immediate: true` (reduced motion or subtle entrance after a crossfade) fires onRest
  // synchronously during render commit — focusing there races the FocusLock in the shared shell
  // and the focus gets stolen. Deferring one tick past commit lets FocusLock settle first.
  useEffect(() => {
    if (!skipTrail) return;
    const id = window.setTimeout(() => {
      ctaRef.current?.focus({ preventScroll: true });
    }, reducedMotion ? 0 : 180);
    return () => window.clearTimeout(id);
  }, [skipTrail, reducedMotion]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 py-8">
      <div aria-live="polite" className="sr-only">
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
            className="min-h-[40px] cursor-pointer rounded-full px-6 text-[12px] font-semibold tracking-wide shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-[filter] duration-150 hover:brightness-110  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:pointer-events-none disabled:opacity-70"
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
  );
});

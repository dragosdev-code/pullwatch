import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { SPONSOR_URL } from '@src/constants/sponsor';
import { KoFiIcon } from '@src/components/ui/icons/ko-fi-icon';

export const SettingsSponsorLounge = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const rawId = useId();
  const noiseFilterId = `pw-sponsor-noise-${rawId.replace(/:/g, '')}`;

  const [revealed, setRevealed] = useState(false);
  const [noiseMounted, setNoiseMounted] = useState(false);

  // WHY [scroll UX]: Fire the staggered reveal only once the card is near the viewport; disconnect immediately so
  // scrolling back through settings does not re-run observers or replay the entrance transition.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      {
        // WHY [timing]: Slight bottom inset avoids triggering while the block is barely peeking; threshold keeps
        // the reveal tied to intentional scroll-into-view rather than a sliver intersection.
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  // WHY [popup perf]: feTurbulence is expensive to rasterize; mounting it on the same frame as `revealed` competes
  // with the opacity/transform entrance. Double rAF defers until after the first paint of that transition.
  useEffect(() => {
    if (!revealed) return;

    const rafIds = { outer: 0, inner: 0 };
    rafIds.outer = requestAnimationFrame(() => {
      rafIds.inner = requestAnimationFrame(() => {
        setNoiseMounted(true);
      });
    });

    return () => {
      cancelAnimationFrame(rafIds.outer);
      cancelAnimationFrame(rafIds.inner);
    };
  }, [revealed]);

  return (
    <section ref={sectionRef} className="relative pt-2 shrink-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/50 mb-2 px-1">
        Support the dev
      </p>

      <div className="pw-sponsor-frame rounded-2xl">
        <div className="pw-sponsor-inner overflow-hidden px-4 py-5">
          {noiseMounted ? (
            <svg
              className="pointer-events-none absolute inset-0 size-full opacity-[0.045] mix-blend-overlay"
              aria-hidden
            >
              <filter id={noiseFilterId} x="0%" y="0%" width="100%" height="100%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.9"
                  numOctaves="2"
                  stitchTiles="stitch"
                  result="noise"
                />
                <feColorMatrix type="saturate" values="0" in="noise" />
              </filter>
              <rect width="100%" height="100%" filter={`url(#${noiseFilterId})`} />
            </svg>
          ) : null}

          <span className="pw-sponsor-orb pw-sponsor-orb--a" aria-hidden />
          <span className="pw-sponsor-orb pw-sponsor-orb--b" aria-hidden />
          <span className="pw-sponsor-orb pw-sponsor-orb--c" aria-hidden />

          <div
            className={clsx(
              'relative z-1 flex flex-col gap-3',
              revealed && 'pw-sponsor-reveal-group--visible'
            )}
          >
            <h2 className="pw-sponsor-reveal-item text-base font-bold tracking-tight text-base-content leading-snug">
              Did Pullwatch save you time today?
            </h2>
            <p className="pw-sponsor-reveal-item text-xs leading-relaxed text-base-content/70">
              If this extension helped you catch a PR faster or smoothed out your workflow, drop a
              tip on Ko-fi to fuel future updates.
            </p>
            <div className="pw-sponsor-reveal-item pt-0.5">
              {/* WHY [no background-link override]: Ko-fi CTA always opens in a foreground tab so the popup
                  closes as the user expects and the user’s “open in background” preference does not silently
                  swallow this rare, intentional click. Plain target=_blank is enough — popup focus loss
                  dismisses the surface for free. */}
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="pw-sponsor-cta pw-sponsor-cta--kofi no-underline"
              >
                <span className="relative z-1 inline-flex items-center gap-[0.45rem]">
                  <KoFiIcon className="size-4 shrink-0" />
                  Support on Ko-fi
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

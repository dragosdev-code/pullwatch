import type { MouseEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { SPONSOR_URL } from '../../constants/sponsor';
import type { LinkOpenBehavior } from '../../hooks/use-link-behavior';
import { isExtensionContext } from '../../utils/is-extension-context';

interface SettingsSponsorLoungeProps {
  linkBehavior: LinkOpenBehavior;
}

export const SettingsSponsorLounge = ({ linkBehavior }: SettingsSponsorLoungeProps) => {
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

  // WHY [extension]: In the extension popup, `target=_blank` behavior is awkward; `chrome.tabs.create` honors
  // settings’ “open links in background” without relying on the popup staying open.
  const handleSponsorClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (linkBehavior === 'background' && isExtensionContext()) {
      e.preventDefault();
      chrome.tabs.create({ url: SPONSOR_URL, active: false });
    }
  };

  return (
    <section ref={sectionRef} className="relative pt-2 shrink-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/50 mb-2 px-1">
        Support the dev
      </p>

      <div className="pw-sponsor-frame rounded-2xl p-px">
        <div className="pw-sponsor-inner overflow-hidden rounded-[0.9rem] px-4 py-5">
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
              If this extension helped you catch a PR faster or smoothed out your workflow, consider
              buying me a coffee to support future updates.
            </p>
            <div className="pw-sponsor-reveal-item pt-0.5">
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSponsorClick}
                className="pw-sponsor-cta no-underline"
              >
                <span className="relative z-1 inline-flex items-center gap-[0.4rem]">
                  <svg
                    className="size-3.5 shrink-0 opacity-90"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17l-.022.012-.007.003-.002.001h-.002z" />
                  </svg>
                  Sponsor on GitHub
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

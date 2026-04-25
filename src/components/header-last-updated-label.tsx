import { animated, config, useSprings } from '@react-spring/web';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { formatLastFetchDetail, formatLastFetchMainLine } from '@src/utils/format-last-fetch-label';

const TICK_MS = 1000;

const DOT_COUNT = 3;
/** WHY ~450ms: slow enough to read as a calm wave, fast enough to feel alive (~1.35s per full cycle). */
const PHASE_MS = 450;
const INACTIVE_DOT_OPACITY = 0.38;
const ACTIVE_LIFT_PX = 1;

/** WHY: label is chrome, not body copy—avoid the text-selection I-beam over the whole row. */
const ROW_CLASS =
  'text-[11px] leading-snug text-base-content/50 tabular-nums m-0 pr-1 cursor-default';

export interface HeaderLastUpdatedLabelProps {
  lastFetchMs: number | null;
  /** True while manual mutations or background storage flag report an active fetch. */
  isUpdating: boolean;
}

const UpdatingNowInline = () => {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % DOT_COUNT);
    }, PHASE_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const [springs] = useSprings(
    DOT_COUNT,
    (i) => ({
      opacity: phase === i ? 1 : INACTIVE_DOT_OPACITY,
      y: phase === i ? -ACTIVE_LIFT_PX : 0,
      config: config.gentle,
      immediate: reducedMotion,
    }),
    [phase, reducedMotion]
  );

  if (reducedMotion) {
    return <p className={ROW_CLASS}>Updating now...</p>;
  }

  return (
    <p className={clsx(ROW_CLASS, 'inline-flex flex-wrap items-baseline gap-x-0')}>
      <span>Updating now</span>
      <span className="inline-flex items-baseline pl-0.5">
        {springs.map((s, i) => (
          <animated.span
            key={i}
            className="inline-block min-w-[0.45em] text-center"
            style={{
              opacity: s.opacity,
              transform: s.y.to((y) => `translateY(${y}px)`),
            }}
          >
            .
          </animated.span>
        ))}
      </span>
    </p>
  );
};

/**
 * Subtitle row: “Updated ” + age suffix. Seconds are exact on the line; the min+sec breakdown
 * appears in a DaisyUI tooltip only on “N min ago”, where the main text hides sub-minute remainder.
 * WHY native tooltip: :hover / :focus-visible shows the bubble immediately—no `tooltip-open` bridge.
 */
export const HeaderLastUpdatedLabel = ({
  lastFetchMs,
  isUpdating,
}: HeaderLastUpdatedLabelProps) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  /** WHY tick whenever we show an age: seconds climb under 1 min and minutes roll after that. */
  const needsClock = !isUpdating && lastFetchMs !== null;

  useEffect(() => {
    if (!needsClock) return;
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [needsClock]);

  if (isUpdating) {
    return <UpdatingNowInline />;
  }

  const main = formatLastFetchMainLine(lastFetchMs, nowMs);

  if (main.variant === 'plain') {
    return <p className={ROW_CLASS}>{main.text}</p>;
  }

  const suffixEl =
    main.detailTooltip && lastFetchMs !== null ? (
      <div
        className={clsx(
          'tooltip tooltip-bottom tooltip-neutral inline-flex max-w-full cursor-default rounded px-0.5 -mx-0.5 outline-none transition-colors duration-200',
          'hover:bg-primary/5 hover:text-base-content/70 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100'
        )}
        tabIndex={0}
      >
        <div className="tooltip-content z-9999 max-w-56 px-0 py-0 text-left shadow-lg">
          <div className="rounded-md px-2.5 py-1.5 text-[11px] font-normal leading-snug whitespace-normal text-neutral-content">
            {formatLastFetchDetail(lastFetchMs, nowMs)}
          </div>
        </div>
        <span className="cursor-default underline-offset-2 decoration-primary/30">
          {main.suffix}
        </span>
      </div>
    ) : (
      <span className="cursor-default">{main.suffix}</span>
    );

  return (
    <div className={clsx(ROW_CLASS, 'flex flex-wrap items-baseline gap-x-1')}>
      <span className="cursor-default">{main.prefix}</span>
      {suffixEl}
    </div>
  );
};

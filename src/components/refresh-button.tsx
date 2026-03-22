import { useSpring, animated, config } from '@react-spring/web';
import clsx from 'clsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MIN_REFRESH_INTERVAL_MS } from '../../extension/common/constants';
import { RefreshIcon } from './ui/icons';

const RING_RADIUS = 18;
const RING_C = 2 * Math.PI * RING_RADIUS;

/** Hover/focus delay before opening DaisyUI tooltip (`tooltip-open`). */
const TOOLTIP_SHOW_DELAY_MS = 1000;

type RefreshRingPhase = 'fetching' | 'throttled' | 'cooldown' | 'ready';

interface RefreshButtonProps {
  manualFetchInProgress: boolean;
  onRefresh: () => void;
  fetchProgress01: number;
  fetchElapsedSeconds: number;
  cooldownProgress01: number;
  timeRemainingMs: number;
  canRefresh: boolean;
  lastInteractionWasThrottled: boolean;
  lastFetchDurationMs: number;
}

function resolvePhase(
  manualFetchInProgress: boolean,
  lastInteractionWasThrottled: boolean,
  canRefresh: boolean,
  timeRemainingMs: number
): RefreshRingPhase {
  if (manualFetchInProgress) return 'fetching';
  if (lastInteractionWasThrottled) return 'throttled';
  if (!canRefresh && timeRemainingMs > 0) return 'cooldown';
  return 'ready';
}

/**
 * DaisyUI shows tooltips on :hover and :focus-visible immediately.
 * We only reveal after TOOLTIP_SHOW_DELAY_MS via `tooltip-open`, so hide until then.
 */
const TOOLTIP_DELAY_GUARD_CLASSES = [
  '[&:not(.tooltip-open):hover>.tooltip-content]:!opacity-0',
  '[&:not(.tooltip-open):hover>.tooltip-content]:!pointer-events-none',
  '[&:not(.tooltip-open):hover]:after:!opacity-0',
  '[&:not(.tooltip-open):has(:focus-visible)>.tooltip-content]:!opacity-0',
  '[&:not(.tooltip-open):has(:focus-visible)>.tooltip-content]:!pointer-events-none',
  '[&:not(.tooltip-open):has(:focus-visible)]:after:!opacity-0',
].join(' ');

export const RefreshButton = ({
  manualFetchInProgress,
  onRefresh,
  fetchProgress01,
  fetchElapsedSeconds,
  cooldownProgress01,
  timeRemainingMs,
  canRefresh,
  lastInteractionWasThrottled,
  lastFetchDurationMs,
}: RefreshButtonProps) => {
  const cooldownActive = !canRefresh && timeRemainingMs > 0;
  const refreshDisabled = manualFetchInProgress || !canRefresh;
  const containerRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const policyId = useId().replace(/:/g, '');

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const scheduleTooltipOpen = useCallback(() => {
    clearShowTimer();
    const id = window.setTimeout(() => {
      showTimerRef.current = null;
      setTooltipOpen(true);
    }, TOOLTIP_SHOW_DELAY_MS);
    showTimerRef.current = id;
  }, [clearShowTimer]);

  const closeTooltipImmediately = useCallback(() => {
    clearShowTimer();
    setTooltipOpen(false);
  }, [clearShowTimer]);

  useEffect(() => () => clearShowTimer(), [clearShowTimer]);

  const handleContainerBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        closeTooltipImmediately();
      }
    },
    [closeTooltipImmediately]
  );

  const phase = resolvePhase(
    manualFetchInProgress,
    lastInteractionWasThrottled,
    canRefresh,
    timeRemainingMs
  );

  const ringProgress01 = useMemo(() => {
    if (manualFetchInProgress) return fetchProgress01;
    if (fetchProgress01 >= 0.99) return 1;
    if (lastInteractionWasThrottled) return cooldownProgress01;
    if (!canRefresh && timeRemainingMs > 0) return cooldownProgress01;
    return 0;
  }, [
    manualFetchInProgress,
    fetchProgress01,
    cooldownProgress01,
    lastInteractionWasThrottled,
    canRefresh,
    timeRemainingMs,
  ]);

  const targetOffset = RING_C * (1 - ringProgress01);

  const ringSpring = useSpring({
    strokeDashoffset: targetOffset,
    config: phase === 'fetching' ? config.default : config.gentle,
  });

  const iconSpring = useSpring({
    transform: manualFetchInProgress ? 'rotate(360deg) scale(1.08)' : 'rotate(0deg) scale(1)',
    config: config.wobbly,
  });

  const refreshBlockedByCooldown = !canRefresh && !manualFetchInProgress;

  const ringStrokeClass =
    manualFetchInProgress || fetchProgress01 >= 0.99
      ? 'stroke-primary'
      : refreshBlockedByCooldown
        ? 'stroke-warning'
        : 'stroke-transparent';

  const secondsLeft = Math.ceil(timeRemainingMs / 1000);

  const tooltipLines = useMemo((): string[] => {
    if (manualFetchInProgress) {
      return ['Refreshing all PR lists…', `${fetchElapsedSeconds.toFixed(1)}s elapsed`];
    }
    if (lastInteractionWasThrottled) {
      return ['Did not refetch (rate limit)', `Try again in ${secondsLeft}s`];
    }
    if (cooldownActive) {
      return ['Manual refresh on cooldown', `${secondsLeft}s until available`];
    }
    if (lastFetchDurationMs > 0) {
      return [
        'Refresh assigned, merged & authored PRs',
        `Last fetch: ${(lastFetchDurationMs / 1000).toFixed(1)}s`,
      ];
    }
    return [
      'Refresh assigned, merged & authored PRs',
      `Max once per ${MIN_REFRESH_INTERVAL_MS / 1000}s`,
    ];
  }, [
    manualFetchInProgress,
    lastInteractionWasThrottled,
    cooldownActive,
    fetchElapsedSeconds,
    secondsLeft,
    lastFetchDurationMs,
  ]);

  const shortAriaLabel = useMemo(() => {
    if (manualFetchInProgress) return 'Refreshing pull requests';
    if (cooldownActive || lastInteractionWasThrottled) return 'Refresh on cooldown';
    return 'Refresh pull requests';
  }, [manualFetchInProgress, cooldownActive, lastInteractionWasThrottled]);

  const showSeconds = manualFetchInProgress || cooldownActive || lastInteractionWasThrottled;

  return (
    <div
      ref={containerRef}
      className={clsx(
        'tooltip tooltip-left tooltip-neutral shrink-0 self-center rounded-full outline-none',
        TOOLTIP_DELAY_GUARD_CLASSES,
        tooltipOpen && 'tooltip-open',
        refreshDisabled &&
          'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100'
      )}
      tabIndex={refreshDisabled ? 0 : -1}
      aria-label={refreshDisabled ? shortAriaLabel : undefined}
      aria-describedby={`refresh-policy-${policyId}`}
      onMouseEnter={scheduleTooltipOpen}
      onMouseLeave={closeTooltipImmediately}
      onFocus={refreshDisabled ? scheduleTooltipOpen : undefined}
      onBlur={refreshDisabled ? handleContainerBlur : undefined}
    >
      <div className="tooltip-content z-[9999] max-w-[12rem] px-0 py-0 text-left shadow-lg">
        <div className="rounded-md px-2.5 py-1.5 text-[11px] font-normal leading-snug whitespace-normal text-neutral-content">
          {tooltipLines.map((line, i) => (
            <p key={i} className={clsx(i > 0 && 'mt-1 opacity-90')}>
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 44 44"
          aria-hidden
        >
          <circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            fill="none"
            className="stroke-base-300/80"
            strokeWidth="2.5"
          />
          <animated.circle
            cx="22"
            cy="22"
            r={RING_RADIUS}
            fill="none"
            className={clsx(ringStrokeClass, 'transition-colors duration-300')}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            style={ringSpring}
          />
        </svg>
        <animated.button
          type="button"
          style={iconSpring}
          onClick={onRefresh}
          disabled={refreshDisabled}
          aria-label={shortAriaLabel}
          aria-describedby={`refresh-policy-${policyId}`}
          aria-busy={manualFetchInProgress}
          onFocus={!refreshDisabled ? scheduleTooltipOpen : undefined}
          onBlur={!refreshDisabled ? handleContainerBlur : undefined}
          className={clsx(
            'relative z-[1] flex items-center justify-center rounded-full p-2 transition-colors duration-200',
            'text-base-content/50 hover:text-base-content hover:bg-base-200',
            'disabled:opacity-60 disabled:pointer-events-none disabled:hover:scale-100',
            canRefresh && !manualFetchInProgress && 'hover:cursor-pointer hover:scale-105',
            manualFetchInProgress && 'disabled:cursor-wait',
            !canRefresh &&
              !manualFetchInProgress &&
              'disabled:cursor-not-allowed text-base-content/35'
          )}
        >
          <RefreshIcon width={18} height={18} />
        </animated.button>

        {showSeconds && (
          <span
            className={clsx(
              'pointer-events-none absolute right-0 top-full z-[2] -mt-0.5 whitespace-nowrap text-right',
              'text-[10px] leading-none tabular-nums tracking-tight',
              manualFetchInProgress && 'text-primary/90',
              lastInteractionWasThrottled && 'text-warning',
              !manualFetchInProgress &&
                cooldownActive &&
                !lastInteractionWasThrottled &&
                'text-base-content/45'
            )}
            aria-hidden
          >
            {manualFetchInProgress && `${fetchElapsedSeconds.toFixed(1)}s`}
            {!manualFetchInProgress && lastInteractionWasThrottled && `Wait ${secondsLeft}s`}
            {!manualFetchInProgress &&
              cooldownActive &&
              !lastInteractionWasThrottled &&
              `${secondsLeft}s`}
          </span>
        )}
      </div>

      <span className="sr-only" id={`refresh-policy-${policyId}`}>
        Minimum interval between manual refreshes is {MIN_REFRESH_INTERVAL_MS / 1000} seconds.
      </span>
    </div>
  );
};

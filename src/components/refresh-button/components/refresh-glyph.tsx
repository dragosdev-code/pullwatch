import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { animated, config, useSpring } from '@react-spring/web';
import clsx from 'clsx';
import type { RefreshRingPhase } from '../types';
import { RING_C, RING_RADIUS } from '../constants';

interface RefreshGlyphProps {
  phase: RefreshRingPhase;
  ringProgress01: number;
  ringStrokeClass: string;
  manualFetchInProgress: boolean;
  canRefresh: boolean;
  refreshDisabled: boolean;
  shortAriaLabel: string;
  policyId: string;
  showSeconds: boolean;
  secondsLeft: number;
  fetchElapsedSeconds: number;
  cooldownActive: boolean;
  lastInteractionWasThrottled: boolean;
  onRefresh: () => void;
  scheduleTooltipOpen: () => void;
  handleContainerBlur: (e: React.FocusEvent) => void;
}

export const RefreshGlyph = ({
  phase,
  ringProgress01,
  ringStrokeClass,
  manualFetchInProgress,
  canRefresh,
  refreshDisabled,
  shortAriaLabel,
  policyId,
  showSeconds,
  secondsLeft,
  fetchElapsedSeconds,
  cooldownActive,
  lastInteractionWasThrottled,
  onRefresh,
  scheduleTooltipOpen,
  handleContainerBlur,
}: RefreshGlyphProps) => {
  const targetOffset = RING_C * (1 - ringProgress01);

  const ringSpring = useSpring({
    strokeDashoffset: targetOffset,
    config: phase === 'fetching' ? config.default : config.gentle,
  });

  const iconSpring = useSpring({
    transform: manualFetchInProgress ? 'rotate(360deg) scale(1.08)' : 'rotate(0deg) scale(1)',
    config: config.wobbly,
  });

  return (
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
          'relative z-1 flex items-center justify-center rounded-full p-2 transition-colors duration-200',
          'text-base-content/50 hover:text-base-content hover:bg-base-200',
          'disabled:opacity-60 disabled:pointer-events-none disabled:hover:scale-100',
          canRefresh && !manualFetchInProgress && 'hover:cursor-pointer hover:scale-105',
          manualFetchInProgress && 'disabled:cursor-wait',
          !canRefresh &&
            !manualFetchInProgress &&
            'disabled:cursor-not-allowed text-base-content/35'
        )}
      >
        <ArrowPathIcon className="h-[18px] w-[18px]" aria-hidden />
      </animated.button>

      {showSeconds && (
        <span
          className={clsx(
            'pointer-events-none absolute right-0 top-full z-2 -mt-0.5 whitespace-nowrap text-right',
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
  );
};

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { animated, config, to, useSpring, useTrail } from '@react-spring/web';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { useGameStore } from '../../context/game-store-context';
import { FINISHED_OVERLAY_ACTION_DELAY_MS } from '../../game-config';
import { formatScore } from '../../format-score';
import { MODE_METADATA } from '../../launcher/mode-metadata';
import { FinishActionsReveal } from './finish-actions-reveal';
import { FinishCooldownIndicator } from './finish-cooldown-indicator';
import type { FinishedOverlayProps } from './types';

/**
 * End-of-round summary over the board. Try again remounts the session via the shell; another mode
 * opens an inline picker: tap a mode to select it, then Play to start.
 */
export function FinishedOverlay({
  mode,
  onTryAgain,
  onChangeMode,
  onExit,
}: FinishedOverlayProps) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);
  const [pickingMode, setPickingMode] = useState(false);
  const [pickerSelected, setPickerSelected] = useState(mode);
  const [actionsReady, setActionsReady] = useState(false);
  const motionOff = usePrefersReducedMotion();

  useEffect(() => {
    if (status !== 'finished') {
      setActionsReady(false);
      return;
    }
    setActionsReady(false);
    const id = window.setTimeout(() => {
      setActionsReady(true);
    }, FINISHED_OVERLAY_ACTION_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const backdropSpring = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    config: { tension: 220, friction: 36 },
    immediate: motionOff,
  });

  const cardSpring = useSpring({
    from: { opacity: 0, y: 28, scale: 0.92 },
    to: { opacity: 1, y: 0, scale: 1 },
    delay: motionOff ? 0 : 40,
    config: config.gentle,
    immediate: motionOff,
  });

  const titleSpring = useSpring({
    from: { opacity: 0, y: 8 },
    to: { opacity: 1, y: 0 },
    delay: motionOff ? 0 : 120,
    config: { tension: 260, friction: 28 },
    immediate: motionOff,
  });

  const statSprings = useTrail(4, {
    from: { opacity: 0, x: -10 },
    to: { opacity: 1, x: 0 },
    delay: motionOff ? 0 : 160,
    config: { tension: 280, friction: 26 },
    immediate: motionOff,
  });

  if (status !== 'finished') return null;

  const { score, highestCombo, bugsSquashed, featuresBroken } = store.getState();

  const openModePicker = () => {
    setPickerSelected(mode);
    setPickingMode(true);
  };

  const commitPickerSelection = () => {
    const picked = pickerSelected;
    setPickingMode(false);
    if (picked === mode) {
      onTryAgain();
    } else {
      onChangeMode?.(picked);
    }
  };

  const statLines: Array<{
    testId:
      | 'squash-finished-score'
      | 'squash-finished-combo'
      | 'squash-finished-bugs'
      | 'squash-finished-features';
    text: string;
    ariaLabel?: string;
  }> = [
    {
      testId: 'squash-finished-score',
      ariaLabel: `final score ${score}`,
      text: `final score ${formatScore(score)}`,
    },
    { testId: 'squash-finished-combo', text: `best combo x${highestCombo}` },
    { testId: 'squash-finished-bugs', text: `bugs ${bugsSquashed}` },
    { testId: 'squash-finished-features', text: `features ${featuresBroken}` },
  ];

  return (
    <animated.div
      data-testid="squash-finished-overlay"
      className="absolute inset-0 z-50 flex items-center justify-center bg-base-300/55 p-4 backdrop-blur-[3px]"
      style={{ opacity: backdropSpring.opacity }}
      role="presentation"
    >
      <animated.div
        className={clsx(
          'w-full rounded-2xl border border-base-content/10 bg-base-100/85 text-center shadow-2xl shadow-base-300/40',
          pickingMode
            ? 'max-w-md px-6 py-7 sm:max-w-lg sm:px-8 sm:py-8'
            : 'max-w-xs px-5 py-6 sm:max-w-sm'
        )}
        role="dialog"
        aria-modal="true"
        aria-busy={!pickingMode && !actionsReady}
        aria-labelledby={pickingMode ? 'squash-finished-mode-title' : 'squash-finished-title'}
        style={{
          opacity: cardSpring.opacity,
          transform: to(
            [cardSpring.y, cardSpring.scale],
            (y, s) => `translateY(${y}px) scale(${s})`
          ),
        }}
      >
        {pickingMode ? (
          <>
            <h3
              id="squash-finished-mode-title"
              className="mb-4 text-base font-bold uppercase tracking-wide text-base-content sm:text-lg"
            >
              pick a mode
            </h3>
            <p className="mb-4 text-left text-sm leading-snug text-base-content/75 sm:text-base">
              Tap a mode to select it, then press Play to start your next round.
            </p>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4">
              {MODE_METADATA.map((meta) => {
                const isSelected = pickerSelected === meta.mode;
                return (
                  <button
                    key={meta.mode}
                    type="button"
                    data-testid={`squash-finished-mode-option-${meta.mode}`}
                    aria-pressed={isSelected}
                    onClick={() => setPickerSelected(meta.mode)}
                    className={clsx(
                      'flex flex-col gap-1 rounded-xl border p-3 text-left transition sm:gap-1.5 sm:p-4',
                      'border-base-300 bg-base-200/60 hover:border-primary/70 hover:bg-primary/10',
                      isSelected && 'border-primary bg-primary/15 ring-2 ring-primary/35'
                    )}
                  >
                    <span className="font-mono text-xs font-bold uppercase tracking-wide text-primary sm:text-sm">
                      {meta.label}
                    </span>
                    <span className="line-clamp-3 text-xs leading-snug text-base-content/75 sm:text-sm">
                      {meta.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 sm:gap-3">
              <button
                type="button"
                data-testid="squash-finished-mode-play"
                onClick={commitPickerSelection}
                className="btn btn-primary w-full text-sm font-semibold uppercase tracking-wide sm:text-base"
              >
                Play
              </button>
              <button
                type="button"
                data-testid="squash-finished-mode-back"
                onClick={() => setPickingMode(false)}
                className="btn btn-ghost w-full text-sm font-mono uppercase tracking-wide sm:text-base"
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <animated.h3
              id="squash-finished-title"
              className="mb-3 text-sm font-bold uppercase tracking-wide text-base-content"
              style={{
                opacity: titleSpring.opacity,
                transform: titleSpring.y.to((y) => `translateY(${y}px)`),
              }}
            >
              round over
            </animated.h3>
            <ul className="mb-5 space-y-1 text-xs text-base-content/90">
              {statLines.map((line, i) => (
                <animated.li
                  key={line.testId}
                  data-testid={line.testId}
                  {...(line.ariaLabel ? { 'aria-label': line.ariaLabel } : {})}
                  style={{
                    opacity: statSprings[i]?.opacity,
                    transform: statSprings[i]?.x.to((x) => `translateX(${x}px)`),
                  }}
                >
                  {line.text}
                </animated.li>
              ))}
            </ul>
            {actionsReady ? (
              <FinishActionsReveal
                motionOff={motionOff}
                onTryAgain={onTryAgain}
                onChangeMode={onChangeMode}
                onExit={onExit}
                openModePicker={openModePicker}
              />
            ) : (
              <div data-testid="squash-finished-actions-pending">
                <FinishCooldownIndicator motionOff={motionOff} delayMs={FINISHED_OVERLAY_ACTION_DELAY_MS} />
              </div>
            )}
          </>
        )}
      </animated.div>
    </animated.div>
  );
}

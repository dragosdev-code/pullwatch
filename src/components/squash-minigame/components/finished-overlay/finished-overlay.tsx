import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { animated, config, to, useSpring } from '@react-spring/web';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { useGameStore } from '../../context/game-store-context';
import { FINISHED_OVERLAY_ACTION_DELAY_MS } from '../../game-config';
import { formatScore } from '../../format-score';
import { MODE_METADATA } from '../../launcher/mode-metadata';
import { FinishActionsReveal } from './finish-actions-reveal';
import { FinishCooldownIndicator } from './finish-cooldown-indicator';
import { FinishScoreRunway } from './finish-score-runway';
import { FinishRoundStats } from './finish-round-stats';
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
  finishCelebration = null,
}: FinishedOverlayProps) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);
  const roundId = useStore(store, (s) => s.roundId);
  const score = useStore(store, (s) => s.score);
  const highestCombo = useStore(store, (s) => s.highestCombo);
  const bugsSquashed = useStore(store, (s) => s.bugsSquashed);
  const featuresBroken = useStore(store, (s) => s.featuresBroken);
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

  const hasPersistMeta =
    status === 'finished' &&
    finishCelebration !== null &&
    finishCelebration.roundId === roundId;

  const fallbackScoreSpring = useSpring({
    from: { opacity: 0, y: 4 },
    to:
      status === 'finished' && !hasPersistMeta
        ? { opacity: 1, y: 0 }
        : { opacity: 0, y: 4 },
    delay: motionOff ? 0 : 100,
    config: { tension: 260, friction: 28 },
    immediate: motionOff,
  });

  const showNewBestBanner =
    status === 'finished' &&
    finishCelebration?.isNewHighScore === true &&
    finishCelebration.roundId === roundId;

  const newBestSpring = useSpring({
    from: { opacity: 0, scale: 0.96, y: -6 },
    to: showNewBestBanner ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: -6 },
    delay: motionOff ? 0 : 80,
    config: { tension: 280, friction: 24 },
    immediate: motionOff,
  });

  if (status !== 'finished') return null;

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
            {showNewBestBanner ? (
              <animated.div
                data-testid="squash-finished-new-best-banner"
                aria-live="polite"
                role="status"
                className="mb-3 rounded-lg border border-success/50 bg-linear-to-r from-success/20 via-success/10 to-accent/15 px-3 py-2.5 font-bold uppercase tracking-widest text-success shadow-[0_0_20px_-8px_var(--color-success)] sm:mb-4 sm:px-4 sm:text-sm"
                style={{
                  opacity: newBestSpring.opacity,
                  transform: to(
                    [newBestSpring.y, newBestSpring.scale],
                    (y, s) => `translateY(${y}px) scale(${s})`
                  ),
                }}
              >
                New best score!
              </animated.div>
            ) : null}
            {hasPersistMeta && finishCelebration ? (
              <FinishScoreRunway
                score={score}
                previousHighScore={finishCelebration.previousHighScore}
                isNewHighScore={finishCelebration.isNewHighScore}
                motionOff={motionOff}
              />
            ) : (
              <animated.p
                data-testid="squash-finished-score"
                aria-label={`final score ${score}`}
                className="mb-3 text-xs text-base-content/90"
                style={{
                  opacity: fallbackScoreSpring.opacity,
                  transform: fallbackScoreSpring.y.to((y) => `translateY(${y}px)`),
                }}
              >
                final score {formatScore(score)}
              </animated.p>
            )}
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
            <FinishRoundStats
              highestCombo={highestCombo}
              bugsSquashed={bugsSquashed}
              featuresBroken={featuresBroken}
              motionOff={motionOff}
            />
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
                <FinishCooldownIndicator
                  motionOff={motionOff}
                  delayMs={FINISHED_OVERLAY_ACTION_DELAY_MS}
                />
              </div>
            )}
          </>
        )}
      </animated.div>
    </animated.div>
  );
}

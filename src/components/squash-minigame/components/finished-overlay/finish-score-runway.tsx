import clsx from 'clsx';
import { animated, useSpring } from '@react-spring/web';
import { formatScore } from '../../format-score';

export interface FinishScoreRunwayProps {
  score: number;
  previousHighScore: number;
  isNewHighScore: boolean;
  motionOff: boolean;
}

function deltaCopy(score: number, previousHighScore: number): { text: string; tone: 'success' | 'neutral' | 'warning' } {
  if (score > previousHighScore) {
    if (previousHighScore <= 0 && score > 0) {
      return { text: 'First score on the board', tone: 'success' };
    }
    const delta = score - previousHighScore;
    return {
      text: `+${formatScore(delta)} past your previous best`,
      tone: 'success',
    };
  }
  if (previousHighScore <= 0) {
    return { text: '', tone: 'neutral' };
  }
  const gap = previousHighScore - score;
  if (gap === 0) {
    return { text: 'Matched your record', tone: 'neutral' };
  }
  return {
    text: `${formatScore(gap)} to beat your record`,
    tone: 'warning',
  };
}

/**
 * Twin runway bars: this run vs stored high before this round, plus a delta chip.
 */
export function FinishScoreRunway({
  score,
  previousHighScore,
  isNewHighScore,
  motionOff,
}: FinishScoreRunwayProps) {
  const denom = Math.max(score, previousHighScore, 1);
  const thisRunPct = (score / denom) * 100;
  const prevPct = previousHighScore > 0 ? (previousHighScore / denom) * 100 : 0;

  const thisBar = useSpring({
    from: { w: 0 },
    to: { w: thisRunPct },
    config: { tension: 200, friction: 30 },
    immediate: motionOff,
  });

  const prevBar = useSpring({
    from: { w: 0 },
    to: { w: prevPct },
    delay: motionOff ? 0 : 70,
    config: { tension: 200, friction: 32 },
    immediate: motionOff,
  });

  const delta = deltaCopy(score, previousHighScore);
  const ariaSummary = `This run ${score} points. Previous best before this round ${previousHighScore} points. ${delta.text || 'Compare scores above.'}`;

  const chipTone =
    delta.tone === 'success'
      ? 'border-success/40 bg-success/10 text-success'
      : delta.tone === 'warning'
        ? 'border-warning/40 bg-warning/10 text-warning'
        : 'border-base-content/15 bg-base-200/80 text-base-content/80';

  return (
    <div
      data-testid="squash-finished-score-runway"
      className="mb-4 text-left"
      aria-label={ariaSummary}
    >
      <div className="mb-2.5">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-mono uppercase tracking-wide text-base-content/70 sm:text-xs">
          <span>This run</span>
          <span className={clsx('tabular-nums text-base-content', isNewHighScore && 'text-primary font-semibold')}>
            {formatScore(score)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-base-300/80">
          <animated.div
            className={clsx(
              'h-full rounded-full bg-linear-to-r from-primary to-accent',
              isNewHighScore && 'shadow-[0_0_12px_-2px_var(--color-primary)]'
            )}
            style={{ width: thisBar.w.to((w) => `${w}%`) }}
          />
        </div>
      </div>

      {previousHighScore > 0 ? (
        <div className="mb-2.5">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-mono uppercase tracking-wide text-base-content/55 sm:text-xs">
            <span>Previous best</span>
            <span className="tabular-nums text-base-content/75">{formatScore(previousHighScore)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-base-300/60">
            <animated.div
              className="h-full rounded-full bg-base-content/25"
              style={{ width: prevBar.w.to((w) => `${w}%`) }}
            />
          </div>
        </div>
      ) : null}

      {delta.text ? (
        <p
          data-testid="squash-finished-score-delta"
          className={clsx(
            'rounded-lg border px-2.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]',
            chipTone
          )}
        >
          {delta.text}
        </p>
      ) : null}
    </div>
  );
}

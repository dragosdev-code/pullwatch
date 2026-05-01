import clsx from 'clsx';
import { animated, useTrail } from '@react-spring/web';

export interface FinishRoundStatsProps {
  highestCombo: number;
  bugsSquashed: number;
  featuresBroken: number;
  motionOff: boolean;
}

const labelClass =
  'text-[11px] font-mono uppercase tracking-wide text-base-content/70 sm:text-xs';

const pillBase = 'rounded-md border px-2 py-0.5 tabular-nums text-sm font-semibold';

/**
 * Three rows (combo / bugs / features) styled to match {@link FinishScoreRunway} runway rows + delta chip.
 * Bug / feature pill tones follow {@link SquashCell} and {@link PHASE_BG}: bugs use `warning`, features `error`.
 */
export function FinishRoundStats({
  highestCombo,
  bugsSquashed,
  featuresBroken,
  motionOff,
}: FinishRoundStatsProps) {
  const rowSprings = useTrail(3, {
    from: { opacity: 0, x: -10 },
    to: { opacity: 1, x: 0 },
    delay: motionOff ? 0 : 160,
    config: { tension: 280, friction: 26 },
    immediate: motionOff,
  });

  const rows = [
    {
      testId: 'squash-finished-combo' as const,
      label: 'Peak combo',
      value: `×${highestCombo}`,
      ariaLabel: `Peak combo ${highestCombo}`,
      pillClass: 'border-primary/35 bg-primary/10 text-primary',
    },
    {
      testId: 'squash-finished-bugs' as const,
      label: 'Bugs squashed',
      value: String(bugsSquashed),
      ariaLabel: `Bugs squashed ${bugsSquashed}`,
      pillClass: 'border-warning/40 bg-warning/10 text-warning',
    },
    {
      testId: 'squash-finished-features' as const,
      label: 'Features broken',
      value: String(featuresBroken),
      ariaLabel: `Features broken ${featuresBroken}`,
      pillClass: 'border-error/40 bg-error/10 text-error',
    },
  ];

  return (
    <div
      data-testid="squash-finished-round-stats"
      className="mb-5 rounded-xl border border-base-content/10 bg-base-200/40 p-3 text-left"
    >
      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <animated.div
            key={row.testId}
            data-testid={row.testId}
            aria-label={row.ariaLabel}
            className="flex items-center justify-between gap-3"
            style={{
              opacity: rowSprings[i]?.opacity,
              transform: rowSprings[i]?.x.to((x) => `translateX(${x}px)`),
            }}
          >
            <span className={labelClass}>{row.label}</span>
            <span className={clsx(pillBase, row.pillClass)}>{row.value}</span>
          </animated.div>
        ))}
      </div>
    </div>
  );
}

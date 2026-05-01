import clsx from 'clsx';
import { formatScore } from '../format-score';

export interface SettingsModeStatsPanelProps {
  playCount: number;
  highScore: number;
  highestCombo: number;
  /** e.g. `neo-terminal-stats-standard` */
  'data-testid': string;
}

const labelClass =
  'text-[9px] font-mono uppercase tracking-wide text-base-content/70 sm:text-[10px]';

const pillBase =
  'rounded border px-1 py-1 tabular-nums text-[10px] font-semibold leading-none sm:text-[11px]';

/**
 * Lifetime stats for one mode in settings — mirrors {@link FinishRoundStats} row + pill layout.
 */
export function SettingsModeStatsPanel({
  playCount,
  highScore,
  highestCombo,
  'data-testid': dataTestId,
}: SettingsModeStatsPanelProps) {
  const rows = [
    {
      label: 'Plays',
      value: formatScore(playCount),
      ariaLabel: `Plays ${playCount}`,
      pillClass: 'border-base-content/20 bg-base-300/50 text-base-content',
    },
    {
      label: 'High score',
      value: formatScore(highScore),
      ariaLabel: `High score ${highScore}`,
      pillClass: 'border-primary/40 bg-primary/10 text-primary',
    },
    {
      label: 'Peak combo',
      value: `×${highestCombo}`,
      ariaLabel: `Peak combo ${highestCombo}`,
      pillClass: 'border-accent/40 bg-accent/10 text-accent',
    },
  ];

  return (
    <div
      data-testid={dataTestId}
      className="mt-1.5 rounded-md border border-base-content/10 bg-base-200/40 p-1.5 text-left"
    >
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2"
            aria-label={row.ariaLabel}
          >
            <span className={labelClass}>{row.label}</span>
            <span className={clsx(pillBase, row.pillClass)}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import clsx from 'clsx';

type CountBadgeSize = 'sm' | 'md';
type CountBadgeTone = 'primary' | 'neutral';

interface CountBadgeProps {
  value: number;
  size?: CountBadgeSize;
  tone?: CountBadgeTone;
  className?: string;
}

const SIZE_CLASSES: Record<CountBadgeSize, string> = {
  sm: 'h-6 min-w-6 text-[14px] font-semibold scale-80',
  md: 'h-6 min-w-6 text-[14px] font-semibold scale-100',
};

const TONE_CLASSES: Record<CountBadgeTone, string> = {
  primary: 'bg-primary text-primary-content',
  neutral: 'bg-base-300 text-base-content',
};

export const CountBadge = ({
  value,
  size = 'sm',
  tone = 'neutral',
  className,
}: CountBadgeProps) => {
  const isThreePlusDigits = Math.abs(value) >= 100;

  return (
    <span
      className={clsx(
        'grid place-items-center rounded-full leading-none tabular-nums',
        SIZE_CLASSES[size],
        isThreePlusDigits && 'min-w-[34px]',
        TONE_CLASSES[tone],
        className
      )}
    >
      {value}
    </span>
  );
};

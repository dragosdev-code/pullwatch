import clsx from 'clsx';
import { useSpring, animated, config } from '@react-spring/web';
import { useState } from 'react';

type CountBadgeSize = 'sm' | 'md';
type CountBadgeTone = 'primary' | 'neutral';

interface CountBadgeProps {
  value: number;
  size?: CountBadgeSize;
  tone?: CountBadgeTone;
  className?: string;
  onClick?: () => void;
  clickable?: boolean;
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
  onClick,
  clickable,
}: CountBadgeProps) => {
  const isThreePlusDigits = Math.abs(value) >= 100;
  const isClickable = clickable ?? !!onClick;
  const [isHovered, setIsHovered] = useState(false);

  // Playful spring animation when clickable and hovered
  const springProps = useSpring({
    transform: isClickable && isHovered ? 'scale(1.10) rotate(360deg)' : 'scale(1) rotate(0deg)',
    config: config.wobbly,
  });

  const AnimatedSpan = animated.span;

  return (
    <AnimatedSpan
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={springProps}
      className={clsx(
        'grid place-items-center rounded-full leading-none tabular-nums',
        SIZE_CLASSES[size],
        isThreePlusDigits && 'min-w-[34px]',
        TONE_CLASSES[tone],
        !isClickable && 'pointer-events-none',
        isClickable && 'cursor-pointer! hover:shadow-md',
        className
      )}
    >
      {value}
    </AnimatedSpan>
  );
};

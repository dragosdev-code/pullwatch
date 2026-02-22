interface DiceIconProps {
  className?: string;
}

export const DiceIcon = ({ className = 'size-4' }: DiceIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      {/* Die body */}
      <rect x="2" y="2" width="20" height="20" rx="4" ry="4" fill="currentColor" />
      {/* 5-pip face - pips punched out in a contrasting color */}
      <circle cx="7" cy="7" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="17" cy="7" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="12" cy="12" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="7" cy="17" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="17" cy="17" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
    </svg>
  );
};

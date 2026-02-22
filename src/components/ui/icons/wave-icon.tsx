interface WaveIconProps {
  className?: string;
}

export const WaveIcon = ({ className = 'size-5' }: WaveIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 10v4" />
      <path d="M6 8v8" />
      <path d="M10 6v12" />
      <path d="M14 8v8" />
      <path d="M18 10v4" />
      <path d="M22 12v0" />
    </svg>
  );
};

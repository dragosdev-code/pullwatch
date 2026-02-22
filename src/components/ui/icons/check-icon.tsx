interface CheckIconProps {
  className?: string;
  strokeWidth?: number;
  width?: number;
  height?: number;
}

export const CheckIcon = ({
  className = 'size-4',
  strokeWidth = 2.5,
  width = 24,
  height = 24,
}: CheckIconProps) => {
  return (
    <svg
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
};

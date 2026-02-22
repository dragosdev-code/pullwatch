interface PlayingAnimationProps {
  className?: string;
}

export const PlayingAnimation = ({ className = 'size-4' }: PlayingAnimationProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="4" y="8" width="2" height="8" rx="1" className="animate-pulse">
        <animate attributeName="height" values="8;4;8" dur="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;10;8" dur="0.6s" repeatCount="indefinite" />
      </rect>
      <rect x="9" y="6" width="2" height="12" rx="1" className="animate-pulse">
        <animate attributeName="height" values="12;6;12" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="y" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
      </rect>
      <rect x="14" y="4" width="2" height="16" rx="1" className="animate-pulse">
        <animate attributeName="height" values="16;8;16" dur="0.7s" repeatCount="indefinite" />
        <animate attributeName="y" values="4;8;4" dur="0.7s" repeatCount="indefinite" />
      </rect>
      <rect x="19" y="8" width="2" height="8" rx="1" className="animate-pulse">
        <animate attributeName="height" values="8;4;8" dur="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;10;8" dur="0.6s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
};

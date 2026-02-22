import clsx from 'clsx';

interface PullRequestMergedIconProps {
  className?: string;
  reviewed?: boolean;
}

export const PullRequestMergedIcon = ({ className, reviewed = false }: PullRequestMergedIconProps) => {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={clsx('mr-2 flex-shrink-0', reviewed ? 'text-purple-400 opacity-60' : 'text-purple-600', className)}
    >
      <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z" />
    </svg>
  );
};

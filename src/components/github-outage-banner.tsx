import { useGitHubOutage } from '../hooks/use-github-outage';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export const GitHubOutageBanner = () => {
  const isOutage = useGitHubOutage();

  if (!isOutage) return null;

  return (
    <div className="px-4 py-2.5 bg-warning/10 border-b border-warning/30 flex items-start gap-2.5">
      <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-px" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-warning leading-snug">
          GitHub is temporarily unavailable
        </p>
        <p className="text-[10px] text-warning/70 leading-snug mt-0.5">
          Showing cached data. This usually resolves on its own within minutes.
        </p>
      </div>
    </div>
  );
};

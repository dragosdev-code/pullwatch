import { useGitHubOutage } from '@src/hooks/use-github-outage';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export const GitHubOutageBanner = () => {
  const isOutage = useGitHubOutage();

  if (!isOutage) return null;

  return (
    <div className="px-4 py-2.5 bg-base-200 border-b border-base-300 border-l-[3px] border-l-warning flex items-start gap-2.5">
      <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-px" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-base-content leading-snug">
          Couldn&apos;t refresh PR data from GitHub
        </p>
        <p className="text-[10px] text-base-content/70 leading-snug mt-0.5">
          Showing cached pull requests. GitHub may be slow, rate-limited, or having a partial outage
          for the APIs this extension uses. Usually back to normal within a few minutes.
        </p>
      </div>
    </div>
  );
};

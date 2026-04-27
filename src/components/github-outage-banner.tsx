import { useEffect, useState } from 'react';
import { useGitHubOutage } from '@src/hooks/use-github-outage';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { formatLastFetchDetail } from '@src/utils/format-last-fetch-label';

/** WHY [30s]: Matches “minutes ago” granularity; avoids per-second timers on a non-critical banner. */
const OUTAGE_SUBLINE_TICK_MS = 30_000;

export const GitHubOutageBanner = () => {
  const { isActive, lastUntrustedAttemptAt } = useGitHubOutage();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive || lastUntrustedAttemptAt == null) return;
    const id = window.setInterval(() => setNowMs(Date.now()), OUTAGE_SUBLINE_TICK_MS);
    return () => window.clearInterval(id);
  }, [isActive, lastUntrustedAttemptAt]);

  if (!isActive) return null;

  return (
    <div className="px-4 py-2.5 bg-base-200 border-b border-base-300 border-l-[3px] border-l-warning flex items-start gap-2.5">
      <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-px" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-base-content leading-snug">
          GitHub may be degraded. Pullwatch has paused notifications.
        </p>
        <p className="text-[10px] text-base-content/70 leading-snug mt-0.5">
          Showing cached pull requests. GitHub may be slow, rate-limited, or having a partial outage
          for the APIs this extension uses. Status:{' '}
          <a
            href="https://www.githubstatus.com"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-base-content"
          >
            githubstatus.com
          </a>
        </p>
        {/* WHY [formatLastFetchDetail]: Same relative-time wording as the header tooltip so staleness reads consistently. */}
        {lastUntrustedAttemptAt != null ? (
          <p className="text-[10px] text-base-content/70 leading-snug mt-0.5 tabular-nums">
            Last check (cached list kept): {formatLastFetchDetail(lastUntrustedAttemptAt, nowMs)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

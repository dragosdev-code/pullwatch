import { useEffect, useState } from 'react';
import { useGitHubOutage } from '@src/hooks/use-github-outage';
import {
  hasCorroboratingStatusCache,
  useGitHubStatusSnapshot,
} from '@src/hooks/use-github-status-snapshot';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { formatLastFetchDetail } from '@src/utils/format-last-fetch-label';
import type { GitHubOutageReason } from '@common/types';

/** WHY [30s]: Matches “minutes ago” granularity; avoids per-second timers on a non-critical banner. */
const OUTAGE_SUBLINE_TICK_MS = 30_000;

const STATUSPAGE_URL = 'https://www.githubstatus.com';

interface VariantCopy {
  variantId: 'outage.transport' | 'outage.component-degraded' | 'outage.list-churn';
  title: string;
  body: string;
}

function pickOutageVariant(reason: GitHubOutageReason): VariantCopy {
  switch (reason) {
    case 'pr_component_degraded':
      return {
        variantId: 'outage.component-degraded',
        title: 'Pullwatch noticed an unusual change in your list.',
        body: 'Keeping your last known list while things settle. New review requests during this window may not show until the next clean sync.',
      };
    case 'pr_list_churn':
      return {
        variantId: 'outage.list-churn',
        title: 'A pull request briefly disappeared and came back.',
        body: 'Pullwatch held back the bouncing one to avoid duplicate alerts. Other list updates still flow through normally.',
      };
    case 'transport':
    default:
      return {
        variantId: 'outage.transport',
        title: "GitHub didn't respond. Showing your last known list.",
        body: 'Pullwatch will retry on its own. If this sticks around, a quick refresh or a check on your connection usually clears it.',
      };
  }
}

export const GitHubOutageBanner = () => {
  const { payload, lastUntrustedAttemptAt } = useGitHubOutage();
  const statusSnapshot = useGitHubStatusSnapshot();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // WHY [reason-gated time line]: only `pr_component_degraded` writes
  // STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT, so showing the “last check” relative-time line for any
  // other reason would tick against a stale or unrelated timestamp.
  const showUntrustedLine =
    payload?.reason === 'pr_component_degraded' && lastUntrustedAttemptAt != null;

  useEffect(() => {
    if (!showUntrustedLine) return;
    const id = window.setInterval(() => setNowMs(Date.now()), OUTAGE_SUBLINE_TICK_MS);
    return () => window.clearInterval(id);
  }, [showUntrustedLine]);

  if (!payload) return null;

  const variant = pickOutageVariant(payload.reason);
  // WHY [Statuspage link gating]: `pr_list_churn` fires independently of Statuspage; linking would
  // dump users on an all-green page. `pr_component_degraded` is signalled for both corroborated
  // suspect-empty AND plain `suspect_partial` (e.g. a merged shrink ≥ threshold) — the latter does
  // NOT require Statuspage corroboration, so we gate the link on the cached snapshot the same way
  // we gate it for `transport`. The reason narrows the *banner copy*; the snapshot decides whether
  // pointing the user at githubstatus.com would line up with what they'll see there.
  const showStatusLink =
    (payload.reason === 'pr_component_degraded' || payload.reason === 'transport') &&
    hasCorroboratingStatusCache(statusSnapshot);

  return (
    <div
      className="px-4 py-2.5 bg-base-200 border-b border-base-300 border-l-[3px] border-l-warning flex items-start gap-2.5"
      data-variant-id={variant.variantId}
    >
      <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-px" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-base-content leading-snug">{variant.title}</p>
        <p className="text-[10px] text-base-content/70 leading-snug mt-0.5">{variant.body}</p>
        {showStatusLink ? (
          <p className="text-[10px] text-base-content/70 leading-snug mt-0.5">
            GitHub Status:{' '}
            <a
              href={STATUSPAGE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-base-content"
            >
              githubstatus.com
            </a>
          </p>
        ) : null}
        {/* WHY [formatLastFetchDetail]: Same relative-time wording as the header tooltip so staleness reads consistently. */}
        {showUntrustedLine && lastUntrustedAttemptAt != null ? (
          <p className="text-[10px] text-base-content/70 leading-snug mt-0.5 tabular-nums">
            Last check (kept your cached list):{' '}
            {formatLastFetchDetail(lastUntrustedAttemptAt, nowMs)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

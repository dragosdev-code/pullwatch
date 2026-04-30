import type { IDebugService } from '../../interfaces/IDebugService';
import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { PullRequest } from '@common/types';
import { FETCH_INTERVAL_MS } from '@common/constants';
import { parseEventTimestampMs } from '@common/pull-request-timestamp';
import { isProblematicPRStatus } from './PrListTrustAssessor';

export class MergedNotificationEligibility {
  constructor(private readonly debugService: IDebugService) {}

  filterFreshCandidates(
    candidates: PullRequest[],
    lastTrustedAt: number | undefined,
    status: GitHubStatusSnapshot
  ): PullRequest[] {
    if (!lastTrustedAt) return candidates;
    const freshnessFloor = lastTrustedAt - FETCH_INTERVAL_MS;
    const strictUnknownTimestamp = isProblematicPRStatus(status);

    return candidates.filter((pr) => {
      const eventAt = parseEventTimestampMs(pr);
      if (eventAt === null) {
        if (strictUnknownTimestamp) {
          this.debugService.warn(
            `[MergedNotificationEligibility] Suppressing merged notification with unknown event timestamp: ${pr.title}`
          );
          return false;
        }
        return true;
      }
      if (eventAt < freshnessFloor) {
        this.debugService.warn(
          `[MergedNotificationEligibility] Suppressing stale merged notification: ${pr.title} (${new Date(eventAt).toISOString()})`
        );
        return false;
      }
      return true;
    });
  }
}

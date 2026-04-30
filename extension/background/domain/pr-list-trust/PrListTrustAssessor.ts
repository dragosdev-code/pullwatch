import type { IGitHubStatusClient } from '../../interfaces/IGitHubStatusClient';
import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { PullRequest } from '@common/types';
import { getMissingPRs } from '@background/utils/pull-request-list-utils';
import type { ListTrustAssessment } from './types';

export function isProblematicPRStatus(status: GitHubStatusSnapshot): boolean {
  if (status.prComponentStatus === 'operational') return false;
  if (status.prComponentStatus === 'unknown') {
    return status.globalIndicator !== 'none' && status.globalIndicator !== 'unknown';
  }
  return true;
}

export class PrListTrustAssessor {
  constructor(private readonly gitHubStatusClient: IGitHubStatusClient) {}

  /**
   * Scores a successful GitHub PR-list fetch before it is allowed to replace the stored baseline.
   *
   * WHY [trusted read boundary]: GitHub can return HTTP 200 and parseable HTML while the search-backed
   * PR list is incomplete. Treating that response as authoritative would shrink `StoredPRs`; when the
   * missing rows reappear, `comparePullRequestLists` would classify them as new and fan out false
   * notifications. Suspicious reads therefore update only trust/limbo metadata, leaving the last-known-good
   * list intact.
   *
   * WHY [Statuspage as multiplier]: `summary.json` is not lifecycle authority. A green status page can
   * lag a local anomaly, and a red status page can lag recovery. The PR component status only changes
   * the strictness of local count checks: operational tolerates small natural list churn, degraded
   * states distrust smaller drops, and unknown status still quarantines large local anomalies.
   *
   * WHY [limbo confirmations]: Legitimate PR-list shrinkage should eventually converge, but not from
   * a single observation. Callers use `missConfirmationsRequired` to keep missing rows in limbo for
   * multiple trusted polls before pruning them from storage.
   */
  async assess(oldPRs: PullRequest[], freshPRs: PullRequest[]): Promise<ListTrustAssessment> {
    const status = await this.gitHubStatusClient.getStatus();
    const missingPRs = getMissingPRs(oldPRs, freshPRs);
    const reasons: string[] = [];

    if (oldPRs.length > 0 && freshPRs.length === 0) {
      reasons.push('empty_after_non_empty');
    }

    const dropRatio = oldPRs.length > 0 ? missingPRs.length / oldPRs.length : 0;
    const problematicStatus = isProblematicPRStatus(status);
    const operationalDropThreshold = Math.max(2, Math.ceil(oldPRs.length * 0.25));
    const degradedDropThreshold = Math.max(2, Math.ceil(oldPRs.length * 0.15));

    if (missingPRs.length > 0 && status.prComponentStatus === 'operational') {
      if (oldPRs.length >= 5 && missingPRs.length >= operationalDropThreshold) {
        reasons.push(`partial_drop_operational:${missingPRs.length}/${oldPRs.length}`);
      }
    } else if (missingPRs.length > 0 && problematicStatus) {
      if (
        status.prComponentStatus === 'partial_outage' ||
        status.prComponentStatus === 'major_outage' ||
        missingPRs.length >= degradedDropThreshold ||
        dropRatio >= 0.15
      ) {
        reasons.push(`partial_drop_degraded:${missingPRs.length}/${oldPRs.length}`);
      }
    } else if (missingPRs.length > 0 && status.prComponentStatus === 'unknown') {
      if (oldPRs.length >= 5 && missingPRs.length >= operationalDropThreshold) {
        reasons.push(`partial_drop_unknown_status:${missingPRs.length}/${oldPRs.length}`);
      }
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
      status,
      missConfirmationsRequired: problematicStatus ? 3 : 2,
    };
  }
}

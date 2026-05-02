import type { IGitHubStatusClient } from '../../interfaces/IGitHubStatusClient';
import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { PullRequest } from '@common/types';
import { getMissingPRs } from '@background/utils/pull-request-list-utils';
import type { ListTrustAssessment, ListTrustKind } from './types';

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
   * WHY [empty-only is a confirmation period, not a veto]: An `empty_after_non_empty` reason on its own
   * (no `partial_drop_*`) is most often the legitimate "I finished my work" steady state — last review
   * cleared, last authored PR merged. The dispatcher in `PRService` routes `kind === 'suspect_empty'`
   * into `EmptyConfirmationTracker` for an N-poll silent confirmation. Only the corroborated path
   * (Statuspage actively bad) and the partial-drop path raise the global outage banner.
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
    let emptyTransition = false;
    let partialDrop = false;

    if (oldPRs.length > 0 && freshPRs.length === 0) {
      reasons.push('empty_after_non_empty');
      emptyTransition = true;
    }

    const problematicStatus = isProblematicPRStatus(status);

    // WHY [partial-drop excludes empty]: `partial_drop_*` is for "some present,
    // some missing" — a true partial fetch. An empty fresh response is not a
    // partial drop; the `empty_after_non_empty` branch above is the single
    // source of truth for that case. Without this guard, empty fresh under
    // any non-operational status (or operational with >=5 stored) would
    // route through `suspect_partial` and signal `pr_component_degraded`,
    // reintroducing the false positive on legitimate-zero for users with
    // five or more cleared review requests.
    if (freshPRs.length > 0) {
      const dropRatio = missingPRs.length / oldPRs.length;
      const operationalDropThreshold = Math.max(2, Math.ceil(oldPRs.length * 0.25));
      const degradedDropThreshold = Math.max(2, Math.ceil(oldPRs.length * 0.15));

      if (missingPRs.length > 0 && status.prComponentStatus === 'operational') {
        if (oldPRs.length >= 5 && missingPRs.length >= operationalDropThreshold) {
          reasons.push(`partial_drop_operational:${missingPRs.length}/${oldPRs.length}`);
          partialDrop = true;
        }
      } else if (missingPRs.length > 0 && problematicStatus) {
        if (
          status.prComponentStatus === 'partial_outage' ||
          status.prComponentStatus === 'major_outage' ||
          missingPRs.length >= degradedDropThreshold ||
          dropRatio >= 0.15
        ) {
          reasons.push(`partial_drop_degraded:${missingPRs.length}/${oldPRs.length}`);
          partialDrop = true;
        }
      } else if (missingPRs.length > 0 && status.prComponentStatus === 'unknown') {
        if (oldPRs.length >= 5 && missingPRs.length >= operationalDropThreshold) {
          reasons.push(`partial_drop_unknown_status:${missingPRs.length}/${oldPRs.length}`);
          partialDrop = true;
        }
      }
    }

    let kind: ListTrustKind;
    if (partialDrop) {
      // WHY [precedence]: a partial-drop on the same assessment supersedes a bare empty
      // because the dispatcher must route through the existing limbo + corroborated outage
      // path. Empty fresh combined with a partial-drop reason should not be possible in
      // practice (partial-drop branches require missing rows AND oldPRs.length >= 5 with
      // a non-empty fresh shape), but precedence is explicit so the dispatcher is total.
      kind = 'suspect_partial';
    } else if (emptyTransition) {
      kind = 'suspect_empty';
    } else {
      kind = 'trusted';
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
      status,
      missConfirmationsRequired: problematicStatus ? 3 : 2,
      kind,
    };
  }
}

import { describe, expect, it, vi } from 'vitest';
import type { PullRequest } from '@common/types';
import type { GitHubStatusSnapshot } from '../../../interfaces/IGitHubStatusClient';
import { MergedNotificationEligibility } from '../MergedNotificationEligibility';

const LAST_TRUSTED_AT = Date.parse('2026-04-27T12:00:00.000Z');

function makeStatus(
  prComponentStatus: GitHubStatusSnapshot['prComponentStatus']
): GitHubStatusSnapshot {
  return { prComponentStatus, globalIndicator: 'none', fetchedAt: LAST_TRUSTED_AT };
}

function makePR(partial: Partial<PullRequest>): PullRequest {
  return {
    id: '1',
    url: 'https://github.com/o/r/pull/1',
    title: 'Merged PR',
    number: 1,
    repoName: 'o/r',
    author: [{ login: 'u' }],
    type: 'merged',
    ...partial,
  };
}

describe('MergedNotificationEligibility', () => {
  it('suppresses stale merged candidates', () => {
    const debugService = { warn: vi.fn() };
    const eligibility = new MergedNotificationEligibility(debugService as never);

    const result = eligibility.filterFreshCandidates(
      [makePR({ eventAt: '2026-04-27T11:30:00.000Z' })],
      LAST_TRUSTED_AT,
      makeStatus('operational')
    );

    expect(result).toEqual([]);
    expect(debugService.warn).toHaveBeenCalledWith(expect.stringContaining('Suppressing stale'));
  });

  it('quarantines unknown timestamps while GitHub PR status is degraded', () => {
    const debugService = { warn: vi.fn() };
    const eligibility = new MergedNotificationEligibility(debugService as never);

    const result = eligibility.filterFreshCandidates(
      [makePR({ timestampParseFailed: true })],
      LAST_TRUSTED_AT,
      makeStatus('degraded_performance')
    );

    expect(result).toEqual([]);
    expect(debugService.warn).toHaveBeenCalledWith(expect.stringContaining('unknown event timestamp'));
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { PullRequest } from '@common/types';
import type { GitHubStatusSnapshot } from '../../../interfaces/IGitHubStatusClient';
import { PrListTrustAssessor } from '../PrListTrustAssessor';

function makePR(id: string): PullRequest {
  return {
    id,
    url: `https://github.com/o/r/pull/${id}`,
    title: `PR ${id}`,
    number: Number(id.replace(/\D/g, '')) || 1,
    repoName: 'o/r',
    author: [{ login: 'u' }],
    type: 'open',
  };
}

function snapshot(
  prComponentStatus: GitHubStatusSnapshot['prComponentStatus'],
  globalIndicator: GitHubStatusSnapshot['globalIndicator'] = 'none'
): GitHubStatusSnapshot {
  return { prComponentStatus, globalIndicator, fetchedAt: Date.now() };
}

describe('PrListTrustAssessor', () => {
  it('allows small operational churn', async () => {
    const getStatus = vi.fn().mockResolvedValue(snapshot('operational'));
    const assessor = new PrListTrustAssessor({ getStatus } as never);

    const assessment = await assessor.assess(
      [makePR('1'), makePR('2'), makePR('3'), makePR('4'), makePR('5')],
      [makePR('1'), makePR('2'), makePR('3'), makePR('4')]
    );

    expect(assessment.suspicious).toBe(false);
    expect(assessment.missConfirmationsRequired).toBe(2);
  });

  it('quarantines large operational drops', async () => {
    const getStatus = vi.fn().mockResolvedValue(snapshot('operational'));
    const assessor = new PrListTrustAssessor({ getStatus } as never);

    const assessment = await assessor.assess(
      [makePR('1'), makePR('2'), makePR('3'), makePR('4'), makePR('5')],
      [makePR('1'), makePR('2'), makePR('3')]
    );

    expect(assessment.suspicious).toBe(true);
    expect(assessment.reasons).toContain('partial_drop_operational:2/5');
  });

  it('uses degraded GitHub status as a stricter local-read multiplier', async () => {
    const getStatus = vi.fn().mockResolvedValue(snapshot('degraded_performance'));
    const assessor = new PrListTrustAssessor({ getStatus } as never);

    const assessment = await assessor.assess(
      [makePR('1'), makePR('2'), makePR('3'), makePR('4'), makePR('5')],
      [makePR('1'), makePR('2'), makePR('3')]
    );

    expect(assessment.suspicious).toBe(true);
    expect(assessment.missConfirmationsRequired).toBe(3);
  });
});

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

  it('tags suspect_partial with partialDropFlavor and missingCount', async () => {
    const opGetStatus = vi.fn().mockResolvedValue(snapshot('operational'));
    const opAssessor = new PrListTrustAssessor({ getStatus: opGetStatus } as never);
    const opAssessment = await opAssessor.assess(
      [makePR('1'), makePR('2'), makePR('3'), makePR('4'), makePR('5')],
      [makePR('1'), makePR('2'), makePR('3')]
    );
    expect(opAssessment.kind).toBe('suspect_partial');
    expect(opAssessment.partialDropFlavor).toBe('operational');
    expect(opAssessment.missingCount).toBe(2);

    const degGetStatus = vi.fn().mockResolvedValue(snapshot('degraded_performance'));
    const degAssessor = new PrListTrustAssessor({ getStatus: degGetStatus } as never);
    const degAssessment = await degAssessor.assess(
      [makePR('1'), makePR('2'), makePR('3'), makePR('4'), makePR('5')],
      [makePR('1'), makePR('2'), makePR('3')]
    );
    expect(degAssessment.partialDropFlavor).toBe('degraded');

    const unkGetStatus = vi
      .fn()
      .mockResolvedValue(snapshot('unknown', 'none'));
    const unkAssessor = new PrListTrustAssessor({ getStatus: unkGetStatus } as never);
    const unkAssessment = await unkAssessor.assess(
      [makePR('1'), makePR('2'), makePR('3'), makePR('4'), makePR('5')],
      [makePR('1'), makePR('2'), makePR('3')]
    );
    expect(unkAssessment.partialDropFlavor).toBe('unknown_status');
  });

  it('reuses preFetchedStatus when supplied — does not call getStatus', async () => {
    const getStatus = vi.fn().mockResolvedValue(snapshot('major_outage', 'critical'));
    const assessor = new PrListTrustAssessor({ getStatus } as never);

    const fixture = snapshot('operational');
    const assessment = await assessor.assess(
      [makePR('1')],
      [makePR('1')],
      fixture
    );

    expect(getStatus).not.toHaveBeenCalled();
    expect(assessment.status).toBe(fixture);
  });

  it('omits partialDropFlavor / missingCount when not suspect_partial', async () => {
    const getStatus = vi.fn().mockResolvedValue(snapshot('operational'));
    const assessor = new PrListTrustAssessor({ getStatus } as never);

    const trustedAssessment = await assessor.assess([makePR('1')], [makePR('1')]);
    expect(trustedAssessment.kind).toBe('trusted');
    expect(trustedAssessment.partialDropFlavor).toBeUndefined();
    expect(trustedAssessment.missingCount).toBeUndefined();
  });
});

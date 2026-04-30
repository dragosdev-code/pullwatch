import { describe, expect, it, vi } from 'vitest';
import type { PullRequest } from '@common/types';
import { PrListTrustStore } from '../PrListTrustStore';
import { MergedLimboPromoter } from '../MergedLimboPromoter';

function makePR(id: string, createdAt = `2026-04-27T12:00:0${id}.000Z`): PullRequest {
  return {
    id,
    url: `https://github.com/o/r/pull/${id}`,
    title: `PR ${id}`,
    number: Number(id),
    repoName: 'o/r',
    author: [{ login: 'u' }],
    type: 'merged',
    createdAt,
    eventAt: createdAt,
  };
}

function makePromoter() {
  const stateByKey: Record<string, unknown> = {};
  const debugService = { warn: vi.fn() };
  const storageService = {
    get: vi.fn(async (key: string) => (stateByKey[key] ?? null) as never),
    set: vi.fn(async (key: string, value: unknown) => {
      stateByKey[key] = value;
    }),
  };
  return {
    promoter: new MergedLimboPromoter(
      new PrListTrustStore(storageService as never, debugService as never)
    ),
    stateByKey,
    storageService,
  };
}

describe('MergedLimboPromoter', () => {
  it('retains a missing merged PR for one trusted confirmation before pruning', async () => {
    const { promoter } = makePromoter();
    const oldPRs = [makePR('1'), makePR('2')];

    const firstTrusted = await promoter.promoteTrustedMergedList(oldPRs, [makePR('1')], 2);
    expect(firstTrusted.map((pr) => pr.id)).toEqual(['2', '1']);

    const secondTrusted = await promoter.promoteTrustedMergedList(oldPRs, [makePR('1')], 2);
    expect(secondTrusted.map((pr) => pr.id)).toEqual(['1']);
  });

  it('records trusted fetch metadata through the storage service', async () => {
    const { promoter, storageService } = makePromoter();

    await promoter.recordTrustedFetch('authored', 4);

    expect(storageService.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        lists: expect.objectContaining({
          authored: expect.objectContaining({ lastTrustedCount: 4, lastReasons: [] }),
        }),
      })
    );
  });
});

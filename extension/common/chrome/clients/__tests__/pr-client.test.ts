/**
 * WHY [fake bg on fetch tests]: `PrClient` depends only on `dispatch` for refresh RPCs; storage
 * is mocked separately for local snapshot reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEY_ASSIGNED_PRS } from '../../../constants';
import type { PullRequest, StoredPRs } from '../../../types';
import { PR_DATA_ACTION } from '../../../runtime-actions';
import { PrClient } from '../pr-client';

vi.mock('../../../transient-storage-retry', () => ({
  runWithTransientStorageRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

vi.mock('../../chrome-globals', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../chrome-globals')>();
  return { ...mod, canReadLocalStorage: () => true };
});

describe('PrClient', () => {
  const storageGet = vi.fn();
  const storage = {
    local: { get: storageGet, set: vi.fn(), remove: vi.fn(), clear: vi.fn(), getBytesInUse: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    session: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  };

  const dispatch = vi.fn();

  beforeEach(() => {
    storageGet.mockReset();
    dispatch.mockReset();
  });

  it('readAssignedFromLocal returns prs from stored envelope', async () => {
    const prs: PullRequest[] = [
      {
        id: '1',
        url: 'https://github.com/o/r/pull/1',
        title: 'T',
        number: 1,
        repoName: 'o/r',
        author: [{ login: 'a' }],
        type: 'open',
        reviewStatus: 'pending',
      },
    ];
    const envelope: StoredPRs = { prs, lastUpdated: new Date().toISOString() };
    storageGet.mockResolvedValue({ [STORAGE_KEY_ASSIGNED_PRS]: envelope });

    const client = new PrClient(storage as never, { dispatch } as never);
    await expect(client.readAssignedFromLocal()).resolves.toEqual(prs);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fetchFreshAssigned forwards PR_DATA_ACTION.fetchAssignedPRs to BackgroundActionClient', async () => {
    dispatch.mockResolvedValue([]);
    const client = new PrClient(storage as never, { dispatch } as never);

    await client.fetchFreshAssigned();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBe(PR_DATA_ACTION.fetchAssignedPRs);
    expect(dispatch.mock.calls[0][1]).toBeUndefined();
  });
});

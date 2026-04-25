/**
 * PR-list `remove` must clear {@link StorageService}'s in-memory fingerprint so a later
 * `setStoredPRs` with the same payload still persists after disk was wiped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../StorageService';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { PullRequest } from '@common/types';
import { STORAGE_KEY_ASSIGNED_PRS } from '@common/constants';

describe('StorageService.remove + PR list fingerprints', () => {
  let localSet: ReturnType<typeof vi.fn>;
  let localRemove: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localSet = vi.fn().mockResolvedValue(undefined);
    localRemove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'chrome',
      {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            set: localSet,
            remove: localRemove,
            getBytesInUse: vi.fn().mockResolvedValue(0),
          },
          sync: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
          },
        },
      } as unknown as (typeof globalThis)['chrome']
    );
  });

  const samplePr: PullRequest = {
    id: '1',
    url: 'https://github.com/o/r/pull/1',
    title: 't',
    number: 1,
    repoName: 'o/r',
    author: [{ login: 'a' }],
    type: 'open',
  };

  it('after remove(PR list key), setStoredPRs with identical data writes again', async () => {
    const debugService: IDebugService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    const svc = new StorageService(debugService);

    await svc.setStoredPRs(STORAGE_KEY_ASSIGNED_PRS, [samplePr]);
    expect(localSet).toHaveBeenCalledTimes(1);

    await svc.setStoredPRs(STORAGE_KEY_ASSIGNED_PRS, [samplePr]);
    expect(localSet).toHaveBeenCalledTimes(1);

    await svc.remove(STORAGE_KEY_ASSIGNED_PRS);
    expect(localRemove).toHaveBeenCalledWith([STORAGE_KEY_ASSIGNED_PRS]);

    await svc.setStoredPRs(STORAGE_KEY_ASSIGNED_PRS, [samplePr]);
    expect(localSet).toHaveBeenCalledTimes(2);
  });
});

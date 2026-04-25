import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../StorageService';
import type { IDebugService } from '../../interfaces/IDebugService';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
  STORAGE_KEY_ROUTE_HINT,
} from '@common/constants';

describe('StorageService.clearGitHubWebSessionCaches', () => {
  let localRemove: ReturnType<typeof vi.fn>;
  let localSet: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localRemove = vi.fn().mockResolvedValue(undefined);
    localSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'chrome',
      {
        storage: {
          local: {
            remove: localRemove,
            get: vi.fn().mockResolvedValue({}),
            set: localSet,
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

  it('removes viewer identity then batches PR cache and probe keys', async () => {
    const debugService: IDebugService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    const svc = new StorageService(debugService);
    await svc.clearGitHubWebSessionCaches();

    expect(localRemove).toHaveBeenCalledTimes(2);
    expect(localRemove.mock.calls[0][0]).toEqual([STORAGE_KEY_GITHUB_VIEWER_IDENTITY]);
    expect(localRemove.mock.calls[1][0]).toEqual([
      STORAGE_KEY_ASSIGNED_PRS,
      STORAGE_KEY_MERGED_PRS,
      STORAGE_KEY_AUTHORED_PRS,
      STORAGE_KEY_LAST_FETCH,
      STORAGE_KEY_ROUTE_HINT,
    ]);
    expect(localSet).toHaveBeenCalledWith({
      [STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING]: true,
    });
  });
});

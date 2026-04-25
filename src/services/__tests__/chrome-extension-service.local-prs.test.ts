import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEY_ASSIGNED_PRS } from '@common/constants';
import type { PullRequest, StoredPRs } from '@common/types';
import { ChromeExtensionService } from '@common/chrome-extension-service';

vi.mock('@common/transient-storage-retry', () => ({
  runWithTransientStorageRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

describe('ChromeExtensionService PR list reads (local storage)', () => {
  const storageGet = vi.fn<(keys: string) => Promise<Record<string, unknown>>>();
  let service: ChromeExtensionService;

  beforeEach(() => {
    storageGet.mockReset();
    service = new ChromeExtensionService();
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn() },
      storage: { local: { get: storageGet } },
    });
  });

  it('readAssignedPrsFromLocalStorage returns prs from envelope', async () => {
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

    await expect(service.readAssignedPrsFromLocalStorage()).resolves.toEqual(prs);
  });

  it('readAssignedPrsFromLocalStorage returns [] when key missing', async () => {
    storageGet.mockResolvedValue({});

    await expect(service.readAssignedPrsFromLocalStorage()).resolves.toEqual([]);
  });
});

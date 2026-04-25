import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEY_ASSIGNED_PRS } from '@common/constants';
import type { PullRequest, StoredPRs } from '@common/types';
import { ChromeExtensionService } from '@common/chrome-extension-service';

vi.mock('@common/transient-storage-retry', () => ({
  runWithTransientStorageRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

describe('ChromeExtensionService PR list reads (local storage)', () => {
  const storageGet = vi.fn<(keys: string) => Promise<Record<string, unknown>>>();
  const noopArea = {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
  let service: ChromeExtensionService;

  beforeEach(() => {
    storageGet.mockReset();
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn() },
      storage: {
        local: { ...noopArea, get: storageGet, getBytesInUse: vi.fn() },
        sync: { ...noopArea },
        session: { ...noopArea },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    service = new ChromeExtensionService();
  });

  it('prs.readAssignedFromLocal returns prs from envelope', async () => {
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

    await expect(service.prs.readAssignedFromLocal()).resolves.toEqual(prs);
  });

  it('prs.readAssignedFromLocal returns [] when key missing', async () => {
    storageGet.mockResolvedValue({});

    await expect(service.prs.readAssignedFromLocal()).resolves.toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '@common/constants';
import type { PullRequest, StoredPRs } from '@common/types';
import { queryKeys } from '@src/constants/query-keys';
import { isExtensionContext } from '@src/utils/is-extension-context';
import { hydratePrQueriesFromStorage } from './hydrate-pr-queries-from-storage';

const storageMocks = vi.hoisted(() => ({
  storageGet: vi.fn(),
  runWithRetry: vi.fn(<T,>(fn: () => Promise<T>) => fn() as Promise<T>),
}));

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: (...args: unknown[]) => storageMocks.storageGet(...args),
      },
    },
  },
}));

vi.mock('@common/transient-storage-retry', () => ({
  runWithTransientStorageRetry: <T,>(fn: () => Promise<T>) =>
    storageMocks.runWithRetry(fn) as Promise<T>,
}));

vi.mock('@src/utils/is-extension-context', () => ({
  isExtensionContext: vi.fn(() => true),
}));

/** Minimal `PullRequest` for envelope payloads — shape matches list consumers. */
const samplePr = (suffix: string): PullRequest => ({
  id: `pr-${suffix}`,
  url: `https://github.com/org/repo/pull/${suffix}`,
  title: `PR ${suffix}`,
  number: Number(suffix) || 1,
  repoName: 'org/repo',
  author: [{ login: 'alice' }],
  type: 'open',
  reviewStatus: 'pending',
});

const envelope = (prs: PullRequest[]): StoredPRs => ({
  prs,
  lastUpdated: new Date().toISOString(),
});

describe('Popup cold start from persisted lists', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    storageMocks.storageGet.mockReset();
    storageMocks.runWithRetry.mockReset();
    storageMocks.runWithRetry.mockImplementation((fn) => fn());
    vi.mocked(isExtensionContext).mockReset();
    vi.mocked(isExtensionContext).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the last assigned, merged, and authored PRs from storage in the query cache before any network refresh', async () => {
    const assignedPrs = [samplePr('1')];
    const mergedPrs = [samplePr('2')];
    const authoredPrs = [samplePr('3')];

    storageMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_ASSIGNED_PRS]: envelope(assignedPrs),
      [STORAGE_KEY_MERGED_PRS]: envelope(mergedPrs),
      [STORAGE_KEY_AUTHORED_PRS]: envelope(authoredPrs),
    });

    await hydratePrQueriesFromStorage(queryClient);

    expect(storageMocks.storageGet).toHaveBeenCalledWith([
      STORAGE_KEY_ASSIGNED_PRS,
      STORAGE_KEY_MERGED_PRS,
      STORAGE_KEY_AUTHORED_PRS,
    ]);
    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toEqual(assignedPrs);
    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toEqual(mergedPrs);
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toEqual(authoredPrs);
  });

  it('leaves the PR lists untouched when the extension runs outside the extension context', async () => {
    vi.mocked(isExtensionContext).mockReturnValue(false);

    storageMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_ASSIGNED_PRS]: envelope([samplePr('x')]),
      [STORAGE_KEY_MERGED_PRS]: envelope([]),
      [STORAGE_KEY_AUTHORED_PRS]: envelope([]),
    });

    await hydratePrQueriesFromStorage(queryClient);

    expect(storageMocks.storageGet).not.toHaveBeenCalled();
    expect(storageMocks.runWithRetry).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toBeUndefined();
  });

  it('fails closed with empty cache behavior when storage read errors after retries', async () => {
    storageMocks.runWithRetry.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(hydratePrQueriesFromStorage(queryClient)).resolves.toBeUndefined();

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toBeUndefined();
  });
});

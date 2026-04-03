import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../../../extension/common/constants';
import type { PullRequest, StoredPRs } from '../../../extension/common/types';
import { queryKeys } from '../../constants/query-keys';
import { usePrListsStorageSync } from '../use-pr-lists-storage-sync';

/** Minimal `PullRequest` for cache shape assertions — only fields the hook touches are required. */
const samplePr: PullRequest = {
  id: 'pr-1',
  url: 'https://github.com/org/repo/pull/1',
  title: 'Sample',
  number: 1,
  repoName: 'org/repo',
  author: [{ login: 'alice' }],
  type: 'open',
  reviewStatus: 'pending',
};

const storedEnvelope = (prs: PullRequest[]): StoredPRs => ({
  prs,
  lastUpdated: new Date().toISOString(),
});

describe('usePrListsStorageSync', () => {
  let queryClient: QueryClient;
  let capturedListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] | undefined;

  const createWrapper = (client: QueryClient) => {
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return Wrapper;
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    capturedListener = undefined;

    const addListener = vi.fn((cb: Parameters<typeof chrome.storage.onChanged.addListener>[0]) => {
      capturedListener = cb;
    });
    const removeListener = vi.fn();

    (
      globalThis as {
        chrome: typeof chrome;
      }
    ).chrome = {
      runtime: { sendMessage: vi.fn() },
      storage: {
        onChanged: {
          addListener,
          removeListener,
        },
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    // Unmount hooks first so effect cleanups still see `chrome`; Vitest runs this file's
    // afterEach before RTL's automatic cleanup would, otherwise `removeListener` throws.
    cleanup();
    delete (globalThis as { chrome?: typeof chrome }).chrome;
    vi.clearAllMocks();
  });

  it('registers chrome.storage.onChanged on mount and removes on unmount', () => {
    const addListener = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
    const removeListener = chrome.storage.onChanged.removeListener as ReturnType<typeof vi.fn>;

    const { unmount } = renderHook(() => usePrListsStorageSync(), {
      wrapper: createWrapper(queryClient),
    });

    expect(addListener).toHaveBeenCalledTimes(1);
    const listenerFn = addListener.mock.calls[0][0];
    unmount();
    expect(removeListener).toHaveBeenCalledWith(listenerFn);
  });

  it('updates assigned PRs query cache when local storage key changes', () => {
    queryClient.setQueryData(queryKeys.assignedPrs, []);

    renderHook(() => usePrListsStorageSync(), {
      wrapper: createWrapper(queryClient),
    });

    expect(capturedListener).toBeDefined();
    capturedListener!(
      {
        [STORAGE_KEY_ASSIGNED_PRS]: {
          oldValue: undefined,
          newValue: storedEnvelope([samplePr]),
        },
      },
      'local',
    );

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toEqual([samplePr]);
  });

  it('updates merged and authored caches for their storage keys', () => {
    queryClient.setQueryData(queryKeys.mergedPrs, []);
    queryClient.setQueryData(queryKeys.authoredPrs, []);

    renderHook(() => usePrListsStorageSync(), {
      wrapper: createWrapper(queryClient),
    });

    const mergedOnly = { ...samplePr, id: 'm1' };
    const authoredOnly = { ...samplePr, id: 'a1' };

    capturedListener!(
      {
        [STORAGE_KEY_MERGED_PRS]: {
          oldValue: undefined,
          newValue: storedEnvelope([mergedOnly]),
        },
        [STORAGE_KEY_AUTHORED_PRS]: {
          oldValue: undefined,
          newValue: storedEnvelope([authoredOnly]),
        },
      },
      'local',
    );

    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toEqual([mergedOnly]);
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toEqual([authoredOnly]);
  });

  it('ignores non-local storage areas', () => {
    queryClient.setQueryData(queryKeys.assignedPrs, []);

    renderHook(() => usePrListsStorageSync(), {
      wrapper: createWrapper(queryClient),
    });

    capturedListener!(
      {
        [STORAGE_KEY_ASSIGNED_PRS]: {
          oldValue: undefined,
          newValue: storedEnvelope([samplePr]),
        },
      },
      'sync',
    );

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toEqual([]);
  });

  it('ignores unrelated local keys', () => {
    queryClient.setQueryData(queryKeys.assignedPrs, []);

    renderHook(() => usePrListsStorageSync(), {
      wrapper: createWrapper(queryClient),
    });

    capturedListener!(
      {
        some_other_key: { oldValue: undefined, newValue: { x: 1 } },
      },
      'local',
    );

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toEqual([]);
  });

  it('clears list when newValue is undefined (key removed)', () => {
    queryClient.setQueryData(queryKeys.assignedPrs, [samplePr]);

    renderHook(() => usePrListsStorageSync(), {
      wrapper: createWrapper(queryClient),
    });

    capturedListener!(
      {
        [STORAGE_KEY_ASSIGNED_PRS]: {
          oldValue: storedEnvelope([samplePr]),
          newValue: undefined,
        },
      },
      'local',
    );

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toEqual([]);
  });
});

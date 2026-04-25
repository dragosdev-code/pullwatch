import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import {
  MINIGAME_DISCOVERY_THRESHOLD,
  STORAGE_KEY_MINIGAME_STATS,
} from '@common/constants';
import type { MinigameStats } from '@common/types';

const getMock = vi.fn();
const setMock = vi.fn();
const addListenerMock = vi.fn();
const removeListenerMock = vi.fn();
const isExtensionContextMock = vi.fn(() => true);

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: (...args: unknown[]) => getMock(...args),
        set: (...args: unknown[]) => setMock(...args),
      },
      onChanged: {
        addListener: (cb: unknown) => addListenerMock(cb),
        removeListener: (cb: unknown) => removeListenerMock(cb),
      },
    },
  },
}));

vi.mock('@src/utils/is-extension-context', () => ({
  isExtensionContext: () => isExtensionContextMock(),
}));

import {
  useMinigameDiscovery,
  __resetMinigameDiscoveryForTests,
} from '../use-minigame-discovery';
import { ensureCompleteMinigameStats } from '../../storage/minigame-stats-defaults';

type StorageListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  area: string,
) => void;

function buildStored(overrides: Partial<MinigameStats> = {}): MinigameStats {
  return {
    ...ensureCompleteMinigameStats(undefined),
    ...overrides,
  };
}

describe('useMinigameDiscovery', () => {
  let storageListener: StorageListener | undefined;

  beforeEach(() => {
    __resetMinigameDiscoveryForTests();
    getMock.mockReset();
    setMock.mockReset().mockResolvedValue(undefined);
    addListenerMock.mockReset();
    removeListenerMock.mockReset();
    isExtensionContextMock.mockReset().mockReturnValue(true);
    storageListener = undefined;
    addListenerMock.mockImplementation((cb: StorageListener) => {
      storageListener = cb;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('hydrates default stats on the first popup open and writes count of one', async () => {
    getMock.mockResolvedValueOnce({});

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.stats?.popupOpenCount).toBe(1);
    expect(result.current.stats?.hasDiscovered).toBe(false);
    expect(setMock).toHaveBeenCalledWith({
      [STORAGE_KEY_MINIGAME_STATS]: expect.objectContaining({
        popupOpenCount: 1,
        hasDiscovered: false,
      }),
    });
  });

  it('keeps hasDiscovered false on the open just before the threshold', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_MINIGAME_STATS]: buildStored({ popupOpenCount: 40 }),
    });

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.stats?.popupOpenCount).toBe(41);
    expect(result.current.stats?.hasDiscovered).toBe(false);
    expect(setMock).toHaveBeenCalledWith({
      [STORAGE_KEY_MINIGAME_STATS]: expect.objectContaining({
        popupOpenCount: 41,
        hasDiscovered: false,
      }),
    });
  });

  it('flips hasDiscovered to true on exactly the threshold open', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_MINIGAME_STATS]: buildStored({
        popupOpenCount: MINIGAME_DISCOVERY_THRESHOLD - 1,
      }),
    });

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.stats?.popupOpenCount).toBe(MINIGAME_DISCOVERY_THRESHOLD);
    expect(result.current.stats?.hasDiscovered).toBe(true);
    expect(setMock).toHaveBeenCalledWith({
      [STORAGE_KEY_MINIGAME_STATS]: expect.objectContaining({
        popupOpenCount: MINIGAME_DISCOVERY_THRESHOLD,
        hasDiscovered: true,
      }),
    });
  });

  it('keeps hasDiscovered true on opens past the threshold and never flips it back', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_MINIGAME_STATS]: buildStored({
        popupOpenCount: MINIGAME_DISCOVERY_THRESHOLD,
        hasDiscovered: true,
      }),
    });

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.stats?.popupOpenCount).toBe(MINIGAME_DISCOVERY_THRESHOLD + 1);
    expect(result.current.stats?.hasDiscovered).toBe(true);
  });

  it('does not write to storage outside of an extension context', async () => {
    isExtensionContextMock.mockReturnValue(false);

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(getMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    expect(addListenerMock).not.toHaveBeenCalled();
    expect(result.current.stats?.popupOpenCount).toBe(0);
    expect(result.current.stats?.hasDiscovered).toBe(false);
  });

  it('propagates onChanged updates from another popup mount', async () => {
    getMock.mockResolvedValueOnce({});

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(storageListener).toBeDefined();

    await act(async () => {
      storageListener!(
        {
          [STORAGE_KEY_MINIGAME_STATS]: {
            oldValue: undefined,
            newValue: buildStored({
              popupOpenCount: MINIGAME_DISCOVERY_THRESHOLD,
              hasDiscovered: true,
            }),
          },
        },
        'local',
      );
    });

    expect(result.current.stats?.popupOpenCount).toBe(MINIGAME_DISCOVERY_THRESHOLD);
    expect(result.current.stats?.hasDiscovered).toBe(true);
  });

  it('ignores onChanged events from non local storage areas', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_MINIGAME_STATS]: buildStored({ popupOpenCount: 5 }),
    });

    const { result } = renderHook(() => useMinigameDiscovery());

    await waitFor(() => expect(result.current.ready).toBe(true));
    const popupCountAfterMount = result.current.stats?.popupOpenCount;

    await act(async () => {
      storageListener!(
        {
          [STORAGE_KEY_MINIGAME_STATS]: {
            oldValue: undefined,
            newValue: buildStored({ popupOpenCount: 999 }),
          },
        },
        'sync',
      );
    });

    expect(result.current.stats?.popupOpenCount).toBe(popupCountAfterMount);
  });

  it('only increments once per popup mount even when the effect runs twice', async () => {
    getMock.mockResolvedValue({
      [STORAGE_KEY_MINIGAME_STATS]: buildStored({ popupOpenCount: 10 }),
    });

    const first = renderHook(() => useMinigameDiscovery());
    await waitFor(() => expect(first.result.current.ready).toBe(true));

    const second = renderHook(() => useMinigameDiscovery());
    await waitFor(() => expect(second.result.current.ready).toBe(true));

    const setCallsWithIncrement = setMock.mock.calls.filter((call) => {
      const arg = call[0] as { [STORAGE_KEY_MINIGAME_STATS]: MinigameStats };
      return arg[STORAGE_KEY_MINIGAME_STATS].popupOpenCount === 11;
    });
    expect(setCallsWithIncrement.length).toBe(1);
  });
});

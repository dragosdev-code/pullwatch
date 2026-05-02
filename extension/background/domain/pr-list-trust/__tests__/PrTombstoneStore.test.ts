import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PrTombstoneStore } from '../PrTombstoneStore';
import {
  PR_TOMBSTONE_MAX_ENTRIES_PER_LIST,
  STORAGE_KEY_PR_TOMBSTONES,
  TOMBSTONE_ALARM_WINDOW,
} from '@common/constants';
import type { IDebugService } from '../../../interfaces/IDebugService';
import type { IStorageService } from '../../../interfaces/IStorageService';

function makeDebug(): IDebugService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;
}

function makeStore() {
  let backing: unknown = undefined;
  const storageService = {
    get: vi.fn(async (key: string) => {
      if (key === STORAGE_KEY_PR_TOMBSTONES) return backing;
      return undefined;
    }),
    set: vi.fn(async (key: string, value: unknown) => {
      if (key === STORAGE_KEY_PR_TOMBSTONES) backing = value;
    }),
  } as unknown as IStorageService;
  const store = new PrTombstoneStore(storageService, makeDebug());
  return { store, storageService, getBacking: () => backing };
}

describe('PrTombstoneStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records dropped keys and leaves survivors alone', async () => {
    const { store, getBacking } = makeStore();

    await store.recordDrops({
      listKind: 'assigned',
      oldKeys: ['a', 'b', 'c'],
      freshKeys: ['a'],
      currentAlarmSeq: 5,
    });

    const state = getBacking() as { byList?: { assigned?: Array<{ prKey: string; droppedAtAlarmSeq: number }> } };
    const log = state.byList?.assigned ?? [];
    const keys = log.map((t) => t.prKey).sort();
    expect(keys).toEqual(['b', 'c']);
    log.forEach((t) => expect(t.droppedAtAlarmSeq).toBe(5));
  });

  it('findResurrected returns intersection of fresh keys with live tombstones', async () => {
    const { store } = makeStore();

    await store.recordDrops({
      listKind: 'assigned',
      oldKeys: ['x', 'y', 'z'],
      freshKeys: [],
      currentAlarmSeq: 1,
    });

    const resurrected = await store.findResurrected({
      listKind: 'assigned',
      freshKeys: ['x', 'q'],
      currentAlarmSeq: 2,
    });

    expect(resurrected).toEqual(['x']);
  });

  it('expires tombstones outside the alarm window (strict greater than)', async () => {
    const { store } = makeStore();

    await store.recordDrops({
      listKind: 'assigned',
      oldKeys: ['gone'],
      freshKeys: [],
      currentAlarmSeq: 0,
    });

    const insideWindow = await store.findResurrected({
      listKind: 'assigned',
      freshKeys: ['gone'],
      currentAlarmSeq: TOMBSTONE_ALARM_WINDOW, // 0 + 4 == window → still alive (delta == 4)
    });
    expect(insideWindow).toEqual(['gone']);

    const outsideWindow = await store.findResurrected({
      listKind: 'assigned',
      freshKeys: ['gone'],
      currentAlarmSeq: TOMBSTONE_ALARM_WINDOW + 1, // delta 5 > 4 → expired
    });
    expect(outsideWindow).toEqual([]);
  });

  it('recordDrops prunes expired entries even when no new keys drop', async () => {
    const { store, getBacking } = makeStore();

    await store.recordDrops({
      listKind: 'merged',
      oldKeys: ['stale'],
      freshKeys: [],
      currentAlarmSeq: 0,
    });

    await store.recordDrops({
      listKind: 'merged',
      oldKeys: [],
      freshKeys: [],
      currentAlarmSeq: TOMBSTONE_ALARM_WINDOW + 5,
    });

    const state = getBacking() as { byList?: { merged?: unknown[] } };
    expect(state.byList?.merged ?? []).toEqual([]);
  });

  it('clearKeys removes the listed keys without touching others', async () => {
    const { store } = makeStore();

    await store.recordDrops({
      listKind: 'authored',
      oldKeys: ['a', 'b'],
      freshKeys: [],
      currentAlarmSeq: 1,
    });

    await store.clearKeys('authored', ['a']);

    const remaining = await store.findResurrected({
      listKind: 'authored',
      freshKeys: ['a', 'b'],
      currentAlarmSeq: 2,
    });
    expect(remaining).toEqual(['b']);
  });

  it('isolates per-list tombstones', async () => {
    const { store } = makeStore();

    await store.recordDrops({
      listKind: 'assigned',
      oldKeys: ['shared'],
      freshKeys: [],
      currentAlarmSeq: 1,
    });

    const onMerged = await store.findResurrected({
      listKind: 'merged',
      freshKeys: ['shared'],
      currentAlarmSeq: 2,
    });
    expect(onMerged).toEqual([]);
  });

  it('refreshes droppedAtAlarmSeq when a key drops again later', async () => {
    const { store, getBacking } = makeStore();

    await store.recordDrops({
      listKind: 'assigned',
      oldKeys: ['flap'],
      freshKeys: [],
      currentAlarmSeq: 1,
    });
    await store.recordDrops({
      listKind: 'assigned',
      oldKeys: ['flap'],
      freshKeys: [],
      currentAlarmSeq: 3,
    });

    const state = getBacking() as { byList?: { assigned?: Array<{ prKey: string; droppedAtAlarmSeq: number }> } };
    const flap = state.byList?.assigned?.find((t) => t.prKey === 'flap');
    expect(flap?.droppedAtAlarmSeq).toBe(3);
  });

  it('honors the LRU cap per list', async () => {
    const { store, getBacking } = makeStore();

    const overflow = PR_TOMBSTONE_MAX_ENTRIES_PER_LIST + 5;
    const oldKeys = Array.from({ length: overflow }, (_, i) => `k${i}`);

    await store.recordDrops({
      listKind: 'merged',
      oldKeys,
      freshKeys: [],
      currentAlarmSeq: 1,
    });

    const state = getBacking() as { byList?: { merged?: unknown[] } };
    expect((state.byList?.merged ?? []).length).toBe(PR_TOMBSTONE_MAX_ENTRIES_PER_LIST);
  });
});

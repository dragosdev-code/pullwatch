import type { IDebugService } from '../../interfaces/IDebugService';
import type { IStorageService } from '../../interfaces/IStorageService';
import {
  PR_TOMBSTONE_MAX_ENTRIES_PER_LIST,
  STORAGE_KEY_PR_TOMBSTONES,
  TOMBSTONE_ALARM_WINDOW,
} from '@common/constants';
import type { ListKind } from './types';

/**
 * Per-list bounded log of `getPrKey` values that disappeared from a trusted persist.
 *
 * WHY [per-list, key=getPrKey]: shares identity with `comparePullRequestLists` so resurrection
 * detection lines up exactly with the "new PR" comparator. A key may legitimately exist in
 * `assigned` and `authored` simultaneously; resurrection on one list does not imply the other.
 *
 * WHY [4-alarm window, strict >]: anchored to alarm ticks via {@link AlarmSeqClock}, not
 * wall-clock — captures flapping that an ms TTL would miss when alarms drift. The expiry test
 * is `currentAlarmSeq - droppedAtAlarmSeq > TOMBSTONE_ALARM_WINDOW`, keeping a tombstone alive
 * through exactly four subsequent waves.
 *
 * WHY [reopen/transfer false-positive accepted]: a genuine reopen within 4 alarms is rare and
 * the worst case is one suppressed notification — preferable to notification storms on actual
 * GitHub flakes.
 */
export interface Tombstone {
  prKey: string;
  droppedAtAlarmSeq: number;
}

export interface PrTombstoneState {
  byList?: Partial<Record<ListKind, Tombstone[]>>;
}

export class PrTombstoneStore {
  constructor(
    private readonly storageService: IStorageService,
    private readonly debugService: IDebugService
  ) {}

  async read(): Promise<PrTombstoneState> {
    try {
      return (await this.storageService.get<PrTombstoneState>(STORAGE_KEY_PR_TOMBSTONES)) ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Adds tombstones for keys present in `oldKeys` but absent from `freshKeys`, and prunes any
   * existing tombstones outside the alarm window.
   *
   * WHY [refresh dropped key seq]: a key that vanishes again resets its `droppedAtAlarmSeq` to
   * the current wave so the resurrection detector sees the most recent disappearance, not the
   * first one. Without this, a flapping key that survives one round-trip would expire before
   * its second flap is observed.
   */
  async recordDrops(args: {
    listKind: ListKind;
    oldKeys: string[];
    freshKeys: string[];
    currentAlarmSeq: number;
  }): Promise<void> {
    const { listKind, oldKeys, freshKeys, currentAlarmSeq } = args;
    const freshSet = new Set(freshKeys);
    const dropped = oldKeys.filter((k) => !freshSet.has(k));

    const state = await this.read();
    const existing = state.byList?.[listKind] ?? [];
    const droppedSet = new Set(dropped);
    const kept = existing.filter(
      (t) =>
        !droppedSet.has(t.prKey) &&
        currentAlarmSeq - t.droppedAtAlarmSeq <= TOMBSTONE_ALARM_WINDOW
    );

    if (dropped.length === 0 && kept.length === existing.length) {
      // No drops and nothing to prune — skip the write.
      return;
    }

    const fresh: Tombstone[] = dropped.map((prKey) => ({
      prKey,
      droppedAtAlarmSeq: currentAlarmSeq,
    }));
    const combined = [...kept, ...fresh];
    // LRU cap by recency — drops oldest seqs first when over the bound.
    const bounded = combined
      .sort((a, b) => b.droppedAtAlarmSeq - a.droppedAtAlarmSeq)
      .slice(0, PR_TOMBSTONE_MAX_ENTRIES_PER_LIST);

    await this.write({ byList: { ...(state.byList ?? {}), [listKind]: bounded } });
  }

  /** Subset of `freshKeys` whose tombstones are still inside the 4-alarm window. */
  async findResurrected(args: {
    listKind: ListKind;
    freshKeys: string[];
    currentAlarmSeq: number;
  }): Promise<string[]> {
    const state = await this.read();
    const list = state.byList?.[args.listKind];
    if (!list || list.length === 0) return [];
    const live = list.filter(
      (t) => args.currentAlarmSeq - t.droppedAtAlarmSeq <= TOMBSTONE_ALARM_WINDOW
    );
    if (live.length === 0) return [];
    const liveSet = new Set(live.map((t) => t.prKey));
    return args.freshKeys.filter((k) => liveSet.has(k));
  }

  /**
   * Removes tombstones for `prKeys` after resurrection has been processed so a follow-up wave
   * does not re-fire `pr_list_churn` for the same keys.
   */
  async clearKeys(listKind: ListKind, prKeys: string[]): Promise<void> {
    if (prKeys.length === 0) return;
    const state = await this.read();
    const list = state.byList?.[listKind] ?? [];
    if (list.length === 0) return;
    const remove = new Set(prKeys);
    const next = list.filter((t) => !remove.has(t.prKey));
    if (next.length === list.length) return;
    await this.write({ byList: { ...(state.byList ?? {}), [listKind]: next } });
  }

  private async write(state: PrTombstoneState): Promise<void> {
    try {
      await this.storageService.set(STORAGE_KEY_PR_TOMBSTONES, state);
    } catch (error) {
      this.debugService.warn('[PrTombstoneStore] Failed to persist tombstone log.', error);
    }
  }
}

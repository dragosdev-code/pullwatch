import type { IService } from '../../interfaces/IService';
import type { IStorageService } from '../../interfaces/IStorageService';
import { STORAGE_KEY_ALARM_SEQ } from '@common/constants';

/**
 * Monotonic counter advanced once per completed alarm wave by `EventService`. Anchors the
 * `PrTombstoneStore` window to alarm ticks rather than wall-clock milliseconds.
 *
 * WHY [alarm-anchored, not ms]: tombstone TTL is "4 alarm intervals". Manual refreshes between
 * alarms must NOT advance the seq — otherwise a user mashing refresh would expire tombstones
 * prematurely. Only `EventService.handleAlarm` is allowed to call {@link advance}.
 *
 * WHY [IService no-op]: registered in `ServiceContainer` so `EventService` (advance) and
 * `PRService` (read for tombstone hooks) share one wired instance. State lives in
 * `chrome.storage.local`, so the lifecycle methods have nothing to do.
 */
export class AlarmSeqClock implements IService {
  constructor(private readonly storageService: IStorageService) {}

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  async current(): Promise<number> {
    return (await this.storageService.get<number>(STORAGE_KEY_ALARM_SEQ)) ?? 0;
  }

  async advance(): Promise<number> {
    const next = (await this.current()) + 1;
    await this.storageService.set(STORAGE_KEY_ALARM_SEQ, next);
    return next;
  }
}

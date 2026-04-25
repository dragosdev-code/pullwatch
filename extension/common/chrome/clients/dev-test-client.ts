import { DEV_TEST_ACTION } from '../../runtime-actions';
import type {
  DevTestAlarmOverrideState,
  DevTestLooperState,
  DevTestNotificationOverrides,
  ScraperUrl,
} from '../../types';
import type { BackgroundActionClient } from './background-action-client';

/** Dev Test Area RPCs — used only by the popup's dev panels. */
export class DevTestClient {
  constructor(private readonly bg: BackgroundActionClient) {}

  fireNotification(overrides?: DevTestNotificationOverrides): Promise<void> {
    return this.bg.dispatch(DEV_TEST_ACTION.fireNotification, overrides);
  }

  startLoop(intervalMs: number): Promise<DevTestLooperState> {
    return this.bg.dispatch<DevTestLooperState>(DEV_TEST_ACTION.startLoop, { intervalMs });
  }

  stopLoop(): Promise<DevTestLooperState> {
    return this.bg.dispatch<DevTestLooperState>(DEV_TEST_ACTION.stopLoop);
  }

  getLooperState(): Promise<DevTestLooperState> {
    return this.bg.dispatch<DevTestLooperState>(DEV_TEST_ACTION.getLooperState);
  }

  overrideAlarm(intervalMs: number): Promise<DevTestAlarmOverrideState> {
    return this.bg.dispatch<DevTestAlarmOverrideState>(DEV_TEST_ACTION.overrideAlarm, {
      intervalMs,
    });
  }

  restoreAlarm(): Promise<DevTestAlarmOverrideState> {
    return this.bg.dispatch<DevTestAlarmOverrideState>(DEV_TEST_ACTION.restoreAlarm);
  }

  getAlarmState(): Promise<DevTestAlarmOverrideState> {
    return this.bg.dispatch<DevTestAlarmOverrideState>(DEV_TEST_ACTION.getAlarmState);
  }

  getScraperUrls(): Promise<ScraperUrl[]> {
    return this.bg.dispatch<ScraperUrl[]>(DEV_TEST_ACTION.getScraperUrls);
  }
}

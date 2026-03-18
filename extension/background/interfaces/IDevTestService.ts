import type {
  DevTestNotificationOverrides,
  DevTestLooperState,
  DevTestAlarmOverrideState,
  ScraperUrl,
} from '../../common/types';

export interface IDevTestService {
  fireTestNotification(overrides?: DevTestNotificationOverrides): Promise<void>;

  startNotificationLoop(intervalMs: number): Promise<DevTestLooperState>;
  stopNotificationLoop(): Promise<DevTestLooperState>;
  getLooperState(): DevTestLooperState;

  overrideAlarmInterval(intervalMs: number): Promise<DevTestAlarmOverrideState>;
  restoreAlarmInterval(): Promise<DevTestAlarmOverrideState>;
  getAlarmOverrideState(): Promise<DevTestAlarmOverrideState>;

  getScraperUrls(): ScraperUrl[];

  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

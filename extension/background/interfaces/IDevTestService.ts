import type {
  DevTestNotificationOverrides,
  DevTestLooperState,
  DevTestAlarmOverrideState,
  ScraperUrl,
} from '../../common/types';
import type { IService } from './IService';

export interface IDevTestService extends IService {
  fireTestNotification(overrides?: DevTestNotificationOverrides): Promise<void>;

  startNotificationLoop(intervalMs: number): Promise<DevTestLooperState>;
  stopNotificationLoop(): Promise<DevTestLooperState>;
  getLooperState(): DevTestLooperState;

  overrideAlarmInterval(intervalMs: number): Promise<DevTestAlarmOverrideState>;
  restoreAlarmInterval(): Promise<DevTestAlarmOverrideState>;
  getAlarmOverrideState(): Promise<DevTestAlarmOverrideState>;

  getScraperUrls(): ScraperUrl[];
}

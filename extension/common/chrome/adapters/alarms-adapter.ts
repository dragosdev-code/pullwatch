import { makeListenerBinding, type ListenerBinding } from '../listener-binding';
import type { Alarm, AlarmCreateInfo, AlarmListener } from '../chrome-types';

export interface AlarmsAdapter {
  create(name: string, alarmInfo: AlarmCreateInfo): Promise<void>;
  get(name: string): Promise<Alarm | undefined>;
  getAll(): Promise<Alarm[]>;
  clear(name: string): Promise<boolean>;
  clearAll(): Promise<boolean>;
  readonly onAlarm: ListenerBinding<AlarmListener>;
}

export function makeAlarmsAdapter(): AlarmsAdapter {
  return {
    create: (name, info) => chrome.alarms.create(name, info),
    get: (name) => chrome.alarms.get(name),
    getAll: () => chrome.alarms.getAll(),
    clear: (name) => chrome.alarms.clear(name),
    clearAll: () => chrome.alarms.clearAll(),
    onAlarm: makeListenerBinding<AlarmListener>(
      (l) => chrome.alarms.onAlarm.addListener(l),
      (l) => chrome.alarms.onAlarm.removeListener(l)
    ),
  };
}

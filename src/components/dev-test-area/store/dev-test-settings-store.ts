import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DevTestSettings } from '../../../../extension/common/types';
import { DEFAULT_DEV_TEST_SETTINGS } from '../../../../extension/common/constants';

interface DevTestSettingsState extends DevTestSettings {
  updateNotification: (patch: Partial<DevTestSettings['notification']>) => void;
  updateLooper: (patch: Partial<DevTestSettings['looper']>) => void;
  updateAlarmOverride: (patch: Partial<DevTestSettings['alarmOverride']>) => void;

  notificationRevision: number;
  looperRevision: number;
  alarmOverrideRevision: number;
}

export const useDevTestSettingsStore = create<DevTestSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_DEV_TEST_SETTINGS,
      notificationRevision: 0,
      looperRevision: 0,
      alarmOverrideRevision: 0,

      updateNotification: (patch) =>
        set((s) => ({
          notification: { ...s.notification, ...patch },
          notificationRevision: s.notificationRevision + 1,
        })),

      updateLooper: (patch) =>
        set((s) => ({
          looper: { ...s.looper, ...patch },
          looperRevision: s.looperRevision + 1,
        })),

      updateAlarmOverride: (patch) =>
        set((s) => ({
          alarmOverride: { ...s.alarmOverride, ...patch },
          alarmOverrideRevision: s.alarmOverrideRevision + 1,
        })),
    }),
    {
      name: 'pr-extension-dev-test-settings',
      partialize: (state) => ({
        notification: state.notification,
        looper: state.looper,
        alarmOverride: state.alarmOverride,
      }),
    }
  )
);

export const useDevTestNotification = () =>
  useDevTestSettingsStore((s) => s.notification);
export const useDevTestLooper = () =>
  useDevTestSettingsStore((s) => s.looper);
export const useDevTestAlarmOverride = () =>
  useDevTestSettingsStore((s) => s.alarmOverride);
export const useNotificationRevision = () =>
  useDevTestSettingsStore((s) => s.notificationRevision);
export const useLooperRevision = () =>
  useDevTestSettingsStore((s) => s.looperRevision);
export const useAlarmOverrideRevision = () =>
  useDevTestSettingsStore((s) => s.alarmOverrideRevision);

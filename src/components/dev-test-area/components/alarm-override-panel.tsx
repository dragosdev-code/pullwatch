import { useCallback, useEffect, useState } from 'react';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { DEV_TEST_MIN_ALARM_OVERRIDE_MS } from '../../../../extension/common/constants';
import { useDevTestSettingsStore, useDevTestAlarmOverride } from '../store/dev-test-settings-store';

export const AlarmOverridePanel = () => {
  const alarmOverride = useDevTestAlarmOverride();
  const updateAlarmOverride = useDevTestSettingsStore((s) => s.updateAlarmOverride);

  const [isOverridden, setIsOverridden] = useState(false);
  const [currentIntervalMs, setCurrentIntervalMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chromeExtensionService
      .devTestGetAlarmState()
      .then((state) => {
        setIsOverridden(state.isOverridden);
        setCurrentIntervalMs(state.intervalMs);
      })
      .catch(() => {});
  }, []);

  const handleToggle = useCallback(async () => {
    setError(null);
    try {
      if (isOverridden) {
        const state = await chromeExtensionService.devTestRestoreAlarm();
        setIsOverridden(state.isOverridden);
        setCurrentIntervalMs(state.intervalMs);
      } else {
        const ms = Math.max(alarmOverride.intervalMs, DEV_TEST_MIN_ALARM_OVERRIDE_MS);
        const state = await chromeExtensionService.devTestOverrideAlarm(ms);
        setIsOverridden(state.isOverridden);
        setCurrentIntervalMs(state.intervalMs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alarm override error');
    }
  }, [isOverridden, alarmOverride.intervalMs]);

  const displaySeconds = (ms: number) => `${(ms / 1000).toFixed(0)}s`;

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-base-content/50">
        Override the production fetch interval (default 1 min). Min{' '}
        {DEV_TEST_MIN_ALARM_OVERRIDE_MS / 1000}s.
      </p>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-base-content/60 shrink-0">Interval (sec):</label>
        <input
          type="number"
          min={DEV_TEST_MIN_ALARM_OVERRIDE_MS / 1000}
          step={5}
          className="input input-xs input-bordered bg-base-200 text-[11px] w-20"
          value={Math.round(alarmOverride.intervalMs / 1000)}
          onChange={(e) => {
            const sec = parseInt(e.target.value, 10);
            if (!isNaN(sec)) updateAlarmOverride({ intervalMs: sec * 1000 });
          }}
        />

        <button
          className={`btn btn-xs flex-1 ${
            isOverridden ? 'btn-success text-success-content' : 'btn-error text-error-content'
          }`}
          onClick={handleToggle}
        >
          {isOverridden ? 'Restore Production' : 'Override Alarm'}
        </button>
      </div>

      {isOverridden && currentIntervalMs !== null && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
          <span className="text-[10px] text-base-content/70">
            Alarm overridden to {displaySeconds(currentIntervalMs)}
          </span>
        </div>
      )}

      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
};

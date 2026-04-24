import { useCallback, useEffect, useState } from 'react';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { DEV_TEST_MIN_LOOP_INTERVAL_MS } from '../../../../extension/common/constants';
import { useDevTestSettingsStore, useDevTestLooper } from '../store/dev-test-settings-store';

export const NotificationLooperPanel = () => {
  const looper = useDevTestLooper();
  const updateLooper = useDevTestSettingsStore((s) => s.updateLooper);

  const [isRunning, setIsRunning] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chromeExtensionService
      .devTestGetLooperState()
      .then((state) => {
        setIsRunning(state.isRunning);
        setSentCount(state.sentCount);
      })
      .catch(() => {});
  }, []);

  const handleToggle = useCallback(async () => {
    setError(null);
    try {
      if (isRunning) {
        const state = await chromeExtensionService.devTestStopLoop();
        setIsRunning(state.isRunning);
        setSentCount(state.sentCount);
      } else {
        const interval = Math.max(looper.intervalMs, DEV_TEST_MIN_LOOP_INTERVAL_MS);
        const state = await chromeExtensionService.devTestStartLoop(interval);
        setIsRunning(state.isRunning);
        setSentCount(state.sentCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Looper error');
    }
  }, [isRunning, looper.intervalMs]);

  useEffect(() => {
    if (!isRunning) return;
    const poll = setInterval(async () => {
      try {
        const state = await chromeExtensionService.devTestGetLooperState();
        setSentCount(state.sentCount);
        if (!state.isRunning) setIsRunning(false);
      } catch {
        /* noop */
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [isRunning]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-base-content/60 shrink-0">Interval (ms):</label>
        <input
          type="number"
          min={DEV_TEST_MIN_LOOP_INTERVAL_MS}
          step={500}
          className="input input-xs input-bordered bg-base-200 text-[11px] w-24"
          value={looper.intervalMs}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) updateLooper({ intervalMs: val });
          }}
        />

        <button
          className={`btn btn-xs flex-1 ${
            isRunning ? 'btn-error text-error-content' : 'btn-warning text-warning-content'
          }`}
          onClick={handleToggle}
        >
          {isRunning ? 'Stop Loop' : 'Start Loop'}
        </button>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-error animate-pulse" />
          <span className="text-[10px] text-base-content/70">
            Running: {sentCount} notification{sentCount !== 1 ? 's' : ''} sent
          </span>
        </div>
      )}

      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
};

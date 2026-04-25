import { useCallback, useRef, useState } from 'react';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { SOUND_DEFINITIONS } from '@common/sound-config';
import { DEV_TEST_NOTIFICATION_DEBOUNCE_MS } from '@common/constants';
import type { NotificationSound } from '@common/types';
import { useDevTestSettingsStore, useDevTestNotification } from '../store/dev-test-settings-store';

export const InstantNotificationPanel = () => {
  const notification = useDevTestNotification();
  const updateNotification = useDevTestSettingsStore((s) => s.updateNotification);

  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleFire = useCallback(async () => {
    if (cooldown) return;
    setError(null);

    try {
      await chromeExtensionService.devTestFireNotification({
        title: notification.title || undefined,
        message: notification.message || undefined,
        sound: notification.sound,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fire notification');
    }

    setCooldown(true);
    cooldownTimer.current = setTimeout(() => setCooldown(false), DEV_TEST_NOTIFICATION_DEBOUNCE_MS);
  }, [cooldown, notification]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Title (default from settings)"
          className="input input-xs input-bordered w-full bg-base-200 text-[11px]"
          value={notification.title}
          onChange={(e) => updateNotification({ title: e.target.value })}
        />
        <input
          type="text"
          placeholder="Message (default from settings)"
          className="input input-xs input-bordered w-full bg-base-200 text-[11px]"
          value={notification.message}
          onChange={(e) => updateNotification({ message: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          className="select select-xs select-bordered bg-base-200 text-[11px] w-20 min-w-0"
          value={notification.sound}
          onChange={(e) => updateNotification({ sound: e.target.value as NotificationSound })}
        >
          {SOUND_DEFINITIONS.map((def) => (
            <option key={def.id} value={def.id}>
              {def.name}
            </option>
          ))}
        </select>

        <button
          className={`btn btn-xs min-w-0 flex-1 truncate ${
            cooldown ? 'btn-disabled opacity-60' : 'btn-warning text-warning-content'
          }`}
          onClick={handleFire}
          disabled={cooldown}
        >
          {cooldown ? 'Cooldown...' : 'Fire Notification'}
        </button>
      </div>

      {error && <p className="text-[10px] text-error">{error}</p>}
    </div>
  );
};

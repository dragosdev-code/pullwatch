import { useFormContext } from 'react-hook-form';
import type { ExtensionSettings } from '../types';
import { SettingsNotificationTestButton } from './settings-notification-test-button';

type TestCategory = 'assigned' | 'merged';

interface NotificationEnableRowProps {
  name: 'assigned.notificationsEnabled' | 'merged.notificationsEnabled';
  description?: string;
  testCategory: TestCategory;
  /** When false, the Test control is disabled (toggle off). */
  notificationsEnabled: boolean;
}

/**
 * Row for "Enable notifications" plus an inline Test affordance; toggle stays right-aligned like other settings.
 * WHY separate from ToggleField: the test button belongs with the label, not the switch.
 */
export function NotificationEnableRow({
  name,
  description,
  testCategory,
  notificationsEnabled,
}: NotificationEnableRowProps) {
  const { register } = useFormContext<ExtensionSettings>();

  return (
    <div className="flex items-start justify-between gap-3 transition-opacity duration-200">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-snug text-base-content">
            Enable notifications
          </span>
          <SettingsNotificationTestButton
            category={testCategory}
            disabled={!notificationsEnabled}
          />
        </div>
        {description && (
          <span className="text-xs leading-snug text-base-content/50">{description}</span>
        )}
      </div>
      <input
        type="checkbox"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...register(name as any)}
        className="toggle toggle-sm toggle-primary mt-0.5 shrink-0"
      />
    </div>
  );
}

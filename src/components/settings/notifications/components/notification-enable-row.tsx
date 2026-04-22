import { useFormContext } from 'react-hook-form';
import { SettingsToggleInput } from '../../shared/components/settings-toggle-input';
import type { ExtensionSettings } from '../../types';
import { NotificationPreviewInfoTip } from './notification-preview-info-tip';
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
    <div className="flex items-start justify-between gap-3">
      {/* WHY [z-10]: Toggle is the next flex sibling; without a stacking context here, its paint order wins and tooltips from the label column render underneath. */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2 transform-[translateZ(0)]">
          <span className="text-sm font-medium leading-snug text-base-content">
            Enable notifications
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <SettingsNotificationTestButton
              category={testCategory}
              disabled={!notificationsEnabled}
            />
            {notificationsEnabled ? <NotificationPreviewInfoTip /> : null}
          </div>
        </div>
        {description && (
          <span className="text-xs leading-snug text-base-content/50">{description}</span>
        )}
      </div>
      <SettingsToggleInput
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...register(name as any)}
        className="toggle toggle-sm toggle-primary mt-0.5 shrink-0"
      />
    </div>
  );
}

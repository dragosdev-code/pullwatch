import { useFormContext } from 'react-hook-form';
import { NotificationEnableRow } from './notification-enable-row';
import { SoundSelectField } from './sound-select-field';
import { NotificationSubsection } from './notification-subsection';
import type { ExtensionSettings } from '../../types';

export const MergedPrsNotificationSection = () => {
  const { watch } = useFormContext<ExtensionSettings>();
  const mergedEnabled = watch('merged.notificationsEnabled');

  return (
    <>
      <NotificationEnableRow
        name="merged.notificationsEnabled"
        description="Receive alerts when your PRs are merged."
        testCategory="merged"
        notificationsEnabled={mergedEnabled}
      />

      <NotificationSubsection enabled={mergedEnabled}>
        <SoundSelectField name="merged.sound" label="Sound" />
      </NotificationSubsection>
    </>
  );
};

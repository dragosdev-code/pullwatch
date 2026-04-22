import { useFormContext } from 'react-hook-form';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { ToggleField } from '../../shared/components/toggle-field';
import { SettingsNoticeTransition } from '../../shared/components/settings-notice-transition';
import { NotificationEnableRow } from './notification-enable-row';
import { SoundSelectField } from './sound-select-field';
import { AssignedDraftNotifySettingsBlock } from './assigned-draft-notify-settings-block';
import { NotificationSubsection } from './notification-subsection';
import { useShowDraftsListHiddenHint } from '../hooks/use-show-drafts-list-hidden-hint';
import type { AssignedDraftNotifyListSync } from '../hooks/use-assigned-draft-notify-list-sync';
import type { ExtensionSettings } from '../../types';

interface ToReviewPrsNotificationSectionProps {
  draftSync: AssignedDraftNotifyListSync;
}

export const ToReviewPrsNotificationSection = ({ draftSync }: ToReviewPrsNotificationSectionProps) => {
  const { control, watch } = useFormContext<ExtensionSettings>();
  const assignedEnabled = watch('assigned.notificationsEnabled');
  const { hintVisible: showDraftsListHiddenHintVisible } = useShowDraftsListHiddenHint(
    draftSync.showDraftsInList
  );

  return (
    <>
      <NotificationEnableRow
        name="assigned.notificationsEnabled"
        description="Receive alerts for new PRs to review."
        testCategory="assigned"
        notificationsEnabled={assignedEnabled}
      />

      <NotificationSubsection enabled={assignedEnabled}>
        <AssignedDraftNotifySettingsBlock
          control={control}
          showDraftsInList={draftSync.showDraftsInList}
          draftNotifyPreferred={draftSync.draftNotifyPreferred}
          setDraftNotifyPreferred={draftSync.setDraftNotifyPreferred}
        />
        <SoundSelectField name="assigned.sound" label="Sound" />
      </NotificationSubsection>

      <div className="border-t border-base-300 pt-3">
        <ToggleField
          name="assigned.showDraftsInList"
          label="Show drafts in list"
          description="Display draft PRs in the To Review list."
        />
        <SettingsNoticeTransition
          visible={showDraftsListHiddenHintVisible}
          className="mt-2 rounded-lg border border-base-300 border-l-[3px] border-l-info bg-base-200 px-3 py-2.5 flex items-start gap-2.5"
        >
          <InformationCircleIcon className="w-4 h-4 text-info shrink-0 mt-px" />
          <p className="text-xs font-medium text-base-content leading-snug min-w-0">
            Draft PRs will leave your 'To Review' list after the next sync, or after using the
            Refresh Button from the top right of the popup.
          </p>
        </SettingsNoticeTransition>
      </div>
    </>
  );
};

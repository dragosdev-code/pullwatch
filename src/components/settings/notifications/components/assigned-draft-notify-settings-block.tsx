import { Controller, type Control } from 'react-hook-form';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ToggleFieldLayout } from '../../shared/components/toggle-field';
import { SettingsToggleInput } from '../../shared/components/settings-toggle-input';
import { SettingsNoticeTransition } from '../../shared/components/settings-notice-transition';
import type { ExtensionSettings } from '../../types';

interface AssignedDraftNotifySettingsBlockProps {
  control: Control<ExtensionSettings>;
  showDraftsInList: boolean;
  draftNotifyPreferred: boolean;
  setDraftNotifyPreferred: (value: boolean) => void;
}

/**
 * "Notify on drafts" row. Warning styling + callout appear only when the list is hidden and the user
 * has turned this toggle on (see `draftNotifyPreferred` in `useAssignedDraftNotifyListSync`).
 *
 * WHY one DOM wrapper: the parent uses `flex flex-col gap-3` with Sound below. A fragment would make
 * the notice a middle flex sibling; when it unmounts after the exit animation, gap topology changes
 * and the sound row nudges again. Keeping toggle + notice in one flex child avoids that.
 */
export const AssignedDraftNotifySettingsBlock = ({
  control,
  showDraftsInList,
  draftNotifyPreferred,
  setDraftNotifyPreferred,
}: AssignedDraftNotifySettingsBlockProps) => {
  return (
    <div className="flex flex-col">
      <Controller
        name="assigned.notifyOnDrafts"
        control={control}
        render={({ field }) => (
          <ToggleFieldLayout
            label="Notify on drafts"
            toggleColor={
              showDraftsInList ? 'primary' : draftNotifyPreferred ? 'warning' : 'primary'
            }
            renderInput={(toggleClassName) => (
              <SettingsToggleInput
                className={toggleClassName}
                checked={showDraftsInList ? !!field.value : draftNotifyPreferred}
                onChange={(e) => {
                  if (showDraftsInList) {
                    field.onChange(e.target.checked);
                  } else {
                    setDraftNotifyPreferred(e.target.checked);
                  }
                }}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            )}
          />
        )}
      />
      <SettingsNoticeTransition
        visible={!showDraftsInList && draftNotifyPreferred}
        className="mt-2 rounded-lg border border-base-300 border-l-[3px] border-l-warning bg-base-200 px-3 py-2.5 flex items-start gap-2.5"
      >
        <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-px" />
        <p className="text-xs font-medium text-base-content leading-snug min-w-0">
          Draft notifications are disabled while drafts are hidden from your list. Enable{' '}
          <span className="font-semibold text-base-content">Show drafts in list</span> below to
          receive alerts for draft PRs.
        </p>
      </SettingsNoticeTransition>
    </div>
  );
};

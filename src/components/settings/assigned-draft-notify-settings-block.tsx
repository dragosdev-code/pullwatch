import { Controller, type Control } from 'react-hook-form';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ToggleFieldLayout } from './form/toggle-field';
import type { ExtensionSettings } from './types';

interface AssignedDraftNotifySettingsBlockProps {
  control: Control<ExtensionSettings>;
  showDraftsInList: boolean;
  draftNotifyPreferred: boolean;
  setDraftNotifyPreferred: (value: boolean) => void;
}

/**
 * "Notify on drafts" row. Warning styling + callout appear only when the list is hidden and the user
 * has turned this toggle on (see `draftNotifyPreferred` in `useAssignedDraftNotifyListSync`).
 */
export const AssignedDraftNotifySettingsBlock = ({
  control,
  showDraftsInList,
  draftNotifyPreferred,
  setDraftNotifyPreferred,
}: AssignedDraftNotifySettingsBlockProps) => {
  return (
    <>
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
              <input
                type="checkbox"
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
      {!showDraftsInList && draftNotifyPreferred && (
        <div
          role="status"
          className="rounded-lg border border-base-300 border-l-[3px] border-l-warning bg-base-200 px-3 py-2.5 flex items-start gap-2.5"
        >
          <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-px" />
          <p className="text-xs font-medium text-base-content leading-snug min-w-0">
            Draft notifications are disabled while drafts are hidden from your list. Enable{' '}
            <span className="font-semibold text-base-content">Show drafts in list</span> below to
            receive alerts for draft PRs.
          </p>
        </div>
      )}
    </>
  );
};

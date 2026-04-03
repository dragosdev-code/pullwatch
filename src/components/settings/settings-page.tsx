import { useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { SettingsSection } from './form/settings-section';
import { ToggleField } from './form/toggle-field';
import { NotificationEnableRow } from './form/notification-enable-row';
import { SoundSelectField } from './form/sound-select-field';
import { ThemePicker } from './form/theme-picker';
import { LinkBehaviorField } from './form/link-behavior-field';
import { useExtensionSettings } from '../../hooks/use-extension-settings';
import { useLinkBehavior } from '../../hooks/use-link-behavior';
import { DEFAULT_SETTINGS } from './types';
import type { ExtensionSettings } from './types';
import { useSavedIndicator } from './use-saved-indicator';
import { SavedIndicator } from './saved-indicator';
import { useAssignedDraftNotifyListSync } from './use-assigned-draft-notify-list-sync';
import { AssignedDraftNotifySettingsBlock } from './assigned-draft-notify-settings-block';
import { useShowDraftsListHiddenHint } from './use-show-drafts-list-hidden-hint';
import { InfoCircleIcon } from '../ui/icons';

interface SettingsPageProps {
  onClose: () => void;
}

export const SettingsPage = ({ onClose }: SettingsPageProps) => {
  const { settings, isLoading, saveSettings } = useExtensionSettings();
  const { behavior: linkBehavior, setBehavior: setLinkBehavior } = useLinkBehavior();
  const { visible: savedVisible, flash: flashSaved, flashId: savedFlashId } = useSavedIndicator();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResettingRef = useRef(false);

  const methods = useForm<ExtensionSettings>({
    defaultValues: DEFAULT_SETTINGS,
  });

  const draftSync = useAssignedDraftNotifyListSync({
    methods,
    settings,
    isLoading,
    isResettingRef,
  });

  const { hintVisible: showDraftsListHiddenHintVisible } = useShowDraftsListHiddenHint(
    draftSync.showDraftsInList
  );

  useEffect(() => {
    if (settings) {
      isResettingRef.current = true;
      methods.reset(settings);
      draftSync.onHydrateFromStorage(settings);
      isResettingRef.current = false;
    }
  }, [settings, methods, draftSync.onHydrateFromStorage]);

  const assignedEnabled = methods.watch('assigned.notificationsEnabled');
  const mergedEnabled = methods.watch('merged.notificationsEnabled');

  const handleLinkBehaviorChange = (newBehavior: Parameters<typeof setLinkBehavior>[0]) => {
    setLinkBehavior(newBehavior);
    flashSaved();
  };

  useEffect(() => {
    const subscription = methods.watch((values) => {
      if (isLoading || !settings || isResettingRef.current) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveSettings(values as Partial<ExtensionSettings>);
        if (draftSync.suppressSavedFlashRef.current) {
          draftSync.suppressSavedFlashRef.current = false;
        } else {
          flashSaved();
        }
      }, 300);
    });
    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [methods, isLoading, settings, saveSettings, flashSaved, draftSync.suppressSavedFlashRef]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-base-300 text-base-content/50 hover:text-base-content transition-colors duration-200 cursor-pointer shrink-0"
            aria-label="Close settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="size-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-base-content leading-none">Settings</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full" />
            <span className="text-sm text-base-content/60">Loading settings...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-base-300 text-base-content/50 hover:text-base-content transition-colors duration-200 cursor-pointer shrink-0"
            aria-label="Close settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="size-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <h1 className="text-base font-bold text-base-content leading-none">Settings</h1>

          <SavedIndicator visible={savedVisible} flashId={savedFlashId} />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 flex flex-col gap-5">
          <SettingsSection title="To Review PRs">
            <NotificationEnableRow
              name="assigned.notificationsEnabled"
              description="Receive alerts for new PRs to review."
              testCategory="assigned"
              notificationsEnabled={assignedEnabled}
            />

            <div
              className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 transition-opacity duration-200 ${
                assignedEnabled ? '' : 'opacity-40 pointer-events-none'
              }`}
            >
              <AssignedDraftNotifySettingsBlock
                control={methods.control}
                showDraftsInList={draftSync.showDraftsInList}
                draftNotifyPreferred={draftSync.draftNotifyPreferred}
                setDraftNotifyPreferred={draftSync.setDraftNotifyPreferred}
              />
              <SoundSelectField name="assigned.sound" label="Sound" />
            </div>

            <div className="border-t border-base-300 pt-3">
              <ToggleField
                name="assigned.showDraftsInList"
                label="Show drafts in list"
                description="Display draft PRs in the To Review list."
              />
              {showDraftsListHiddenHintVisible && (
                <div
                  role="status"
                  className="mt-2 rounded-lg border border-base-300 border-l-[3px] border-l-info bg-base-200 px-3 py-2.5 flex items-start gap-2.5"
                >
                  <InfoCircleIcon className="w-4 h-4 text-info shrink-0 mt-px" />
                  <p className="text-xs font-medium text-base-content leading-snug min-w-0">
                    Draft PRs will leave your 'To Review' list after the next sync, or after using
                    the Refresh Button from the top right of the popup.
                  </p>
                </div>
              )}
            </div>
          </SettingsSection>

          <SettingsSection title="Merged PRs">
            <NotificationEnableRow
              name="merged.notificationsEnabled"
              description="Receive alerts when your PRs are merged."
              testCategory="merged"
              notificationsEnabled={mergedEnabled}
            />

            <div
              className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 transition-opacity duration-200 ${
                mergedEnabled ? '' : 'opacity-40 pointer-events-none'
              }`}
            >
              <SoundSelectField name="merged.sound" label="Sound" />
            </div>
          </SettingsSection>

          <SettingsSection title="Behavior">
            <LinkBehaviorField value={linkBehavior} onChange={handleLinkBehaviorChange} />
          </SettingsSection>

          <SettingsSection title="Appearance">
            <ThemePicker />
          </SettingsSection>
        </div>
      </div>
    </FormProvider>
  );
};

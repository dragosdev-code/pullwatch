import { useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsSection } from '../shared/components/settings-section';
import { ToggleField } from '../shared/components/toggle-field';
import { SavedIndicator } from '../shared/components/saved-indicator';
import { useSavedIndicator } from '../shared/hooks/use-saved-indicator';
import { NotificationEnableRow } from '../notifications/components/notification-enable-row';
import { SoundSelectField } from '../notifications/components/sound-select-field';
import { AssignedDraftNotifySettingsBlock } from '../notifications/components/assigned-draft-notify-settings-block';
import { useAssignedDraftNotifyListSync } from '../notifications/hooks/use-assigned-draft-notify-list-sync';
import { useShowDraftsListHiddenHint } from '../notifications/hooks/use-show-drafts-list-hidden-hint';
import { LinkBehaviorField } from '../behavior/components/link-behavior-field';
import { ThemePicker } from '../appearance/components/theme-picker';
import { SettingsSponsorLounge } from '../support/components/settings-sponsor-lounge';
import { DEFAULT_SETTINGS } from '../types';
import type { ExtensionSettings } from '../types';
import { useExtensionSettings } from '../../../hooks/use-extension-settings';
import { useLinkBehavior } from '../../../hooks/use-link-behavior';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { SettingsNoticeTransition } from '../shared/components/settings-notice-transition';

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
        <SettingsPageHeader onClose={onClose} linkBehavior={linkBehavior} />
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
        <SettingsPageHeader onClose={onClose} linkBehavior={linkBehavior}>
          <SavedIndicator visible={savedVisible} flashId={savedFlashId} />
        </SettingsPageHeader>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-4 pt-3 flex flex-col gap-5">
          <SettingsSection title="To Review PRs">
            <NotificationEnableRow
              name="assigned.notificationsEnabled"
              description="Receive alerts for new PRs to review."
              testCategory="assigned"
              notificationsEnabled={assignedEnabled}
            />

            <div
              className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 ${
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
          </SettingsSection>

          <SettingsSection title="Merged PRs">
            <NotificationEnableRow
              name="merged.notificationsEnabled"
              description="Receive alerts when your PRs are merged."
              testCategory="merged"
              notificationsEnabled={mergedEnabled}
            />

            <div
              className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 ${
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

          <SettingsSponsorLounge linkBehavior={linkBehavior} />
        </div>
      </div>
    </FormProvider>
  );
};

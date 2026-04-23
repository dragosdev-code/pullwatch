import { useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { SettingsPageHeader } from './settings-page-header';
import { SettingsSection } from '../shared/components/settings-section';
import { SavedIndicator } from '../shared/components/saved-indicator';
import { useSavedIndicator } from '../shared/hooks/use-saved-indicator';
import { ToReviewPrsNotificationSection } from '../notifications/components/to-review-prs-notification-section';
import { MergedPrsNotificationSection } from '../notifications/components/merged-prs-notification-section';
import { useAssignedDraftNotifyListSync } from '../notifications/hooks/use-assigned-draft-notify-list-sync';
import { LinkBehaviorField } from '../behavior/components/link-behavior-field';
import { ThemePicker } from '../appearance/components/theme-picker';
import { PopupSizeField } from '../appearance/components/popup-size-field';
import { SettingsSponsorLounge } from '../support/components/settings-sponsor-lounge';
import { DEFAULT_SETTINGS } from '../types';
import type { ExtensionSettings } from '../types';
import { useExtensionSettings } from '../../../hooks/use-extension-settings';
import { useLinkBehavior } from '../../../hooks/use-link-behavior';

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

  useEffect(() => {
    if (settings) {
      isResettingRef.current = true;
      methods.reset(settings);
      draftSync.onHydrateFromStorage(settings);
      isResettingRef.current = false;
    }
  }, [settings, methods, draftSync.onHydrateFromStorage]);

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
            <ToReviewPrsNotificationSection draftSync={draftSync} />
          </SettingsSection>

          <SettingsSection title="Merged PRs">
            <MergedPrsNotificationSection />
          </SettingsSection>

          <SettingsSection title="Behavior">
            <LinkBehaviorField value={linkBehavior} onChange={handleLinkBehaviorChange} />
          </SettingsSection>

          <SettingsSection title="Appearance">
            <PopupSizeField />
            <ThemePicker />
          </SettingsSection>

          <SettingsSponsorLounge linkBehavior={linkBehavior} />
        </div>
      </div>
    </FormProvider>
  );
};

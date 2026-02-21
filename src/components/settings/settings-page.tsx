import { useEffect, useRef, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { SettingsSection } from './form/settings-section';
import { ToggleField } from './form/toggle-field';
import { SoundSelectField } from './form/sound-select-field';
import { ThemePicker } from './form/theme-picker';
import { useExtensionSettings } from '../../hooks/use-extension-settings';
import { DEFAULT_SETTINGS } from './types';
import type { ExtensionSettings } from './types';

interface SettingsPageProps {
  onClose: () => void;
}

export const SettingsPage = ({ onClose }: SettingsPageProps) => {
  const { settings, isLoading, saveSettings } = useExtensionSettings();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize form with default settings, will be updated when settings load
  const methods = useForm<ExtensionSettings>({
    defaultValues: DEFAULT_SETTINGS,
  });

  // Update form values when settings are loaded from storage
  useEffect(() => {
    if (settings) {
      methods.reset(settings);
    }
  }, [settings, methods]);

  const assignedEnabled = methods.watch('assigned.notificationsEnabled');
  const mergedEnabled = methods.watch('merged.notificationsEnabled');

  // Auto-save settings when form values change
  useEffect(() => {
    const subscription = methods.watch((values) => {
      // Don't save while loading initial settings
      if (isLoading || !settings) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        // Save to chrome.storage.sync via the hook
        saveSettings(values as Partial<ExtensionSettings>);

        setShowSaved(true);
        if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
        savedFadeRef.current = setTimeout(() => setShowSaved(false), 1500);
      }, 300);
    });
    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
    };
  }, [methods, isLoading, settings, saveSettings]);

  // Show loading state while settings are loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
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
        {/* Loading state */}
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
        {/* Header */}
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

          {/* Saved indicator */}
          <div
            className={`flex items-center gap-1 ml-auto transition-opacity duration-300 ${
              showSaved ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
              className="size-3 text-primary"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-[11px] text-base-content/50">Saved</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 flex flex-col gap-5">
          {/* Assigned PRs */}
          <SettingsSection title="Assigned PRs">
            <ToggleField
              name="assigned.notificationsEnabled"
              label="Enable notifications"
              description="Receive alerts for new PRs assigned to you."
            />

            {/* Sub-group: only active when notifications are enabled */}
            <div
              className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 transition-opacity duration-200 ${
                assignedEnabled ? '' : 'opacity-40 pointer-events-none'
              }`}
            >
              <ToggleField name="assigned.notifyOnDrafts" label="Notify on drafts" />
              <SoundSelectField name="assigned.sound" label="Notification sound" />
            </div>

            <div className="border-t border-base-300 pt-3">
              <ToggleField
                name="assigned.showDraftsInList"
                label="Show drafts in list"
                description="Display draft PRs in the assigned PRs list."
              />
            </div>
          </SettingsSection>

          {/* Merged PRs */}
          <SettingsSection title="Merged PRs">
            <ToggleField
              name="merged.notificationsEnabled"
              label="Enable notifications"
              description="Receive alerts when your PRs are merged."
            />

            {/* Sub-group: only active when notifications are enabled */}
            <div
              className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 transition-opacity duration-200 ${
                mergedEnabled ? '' : 'opacity-40 pointer-events-none'
              }`}
            >
              <SoundSelectField name="merged.sound" label="Notification sound" />
            </div>
          </SettingsSection>

          {/* Appearance */}
          <SettingsSection title="Appearance">
            <ThemePicker />
          </SettingsSection>
        </div>
      </div>
    </FormProvider>
  );
};

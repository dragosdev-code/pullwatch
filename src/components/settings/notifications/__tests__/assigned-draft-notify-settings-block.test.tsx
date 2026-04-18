import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { AssignedDraftNotifySettingsBlock } from '../components/assigned-draft-notify-settings-block';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../types';

/**
 * `Partial<ExtensionSettings>` only shallow-partializes: a provided `assigned` value must still
 * include every assigned field. Tests only vary draft-related keys, so we accept deep partials
 * for `assigned` / `merged` and merge onto defaults.
 */
type SettingsTestPatch = {
  assigned?: Partial<ExtensionSettings['assigned']>;
  merged?: Partial<ExtensionSettings['merged']>;
};

const mergeSettings = (patch: SettingsTestPatch): ExtensionSettings => ({
  ...DEFAULT_SETTINGS,
  assigned: { ...DEFAULT_SETTINGS.assigned, ...patch.assigned },
  merged: { ...DEFAULT_SETTINGS.merged, ...patch.merged },
});

function BlockHarness({
  settings,
  showDraftsInList,
  draftNotifyPreferred,
  setDraftNotifyPreferred,
}: {
  settings: ExtensionSettings;
  showDraftsInList: boolean;
  draftNotifyPreferred: boolean;
  setDraftNotifyPreferred: (value: boolean) => void;
}) {
  const methods = useForm<ExtensionSettings>({ defaultValues: settings, values: settings });
  return (
    <FormProvider {...methods}>
      <AssignedDraftNotifySettingsBlock
        control={methods.control}
        showDraftsInList={showDraftsInList}
        draftNotifyPreferred={draftNotifyPreferred}
        setDraftNotifyPreferred={setDraftNotifyPreferred}
      />
    </FormProvider>
  );
}

/** Parent-owned preference state, like settings-page. */
function StatefulBlockHarness({
  initialSettings,
  showDraftsInList,
  initialDraftNotifyPreferred,
}: {
  initialSettings: ExtensionSettings;
  showDraftsInList: boolean;
  initialDraftNotifyPreferred: boolean;
}) {
  const [draftNotifyPreferred, setDraftNotifyPreferred] = useState(initialDraftNotifyPreferred);
  const methods = useForm<ExtensionSettings>({
    defaultValues: initialSettings,
    values: initialSettings,
  });
  return (
    <FormProvider {...methods}>
      <AssignedDraftNotifySettingsBlock
        control={methods.control}
        showDraftsInList={showDraftsInList}
        draftNotifyPreferred={draftNotifyPreferred}
        setDraftNotifyPreferred={setDraftNotifyPreferred}
      />
    </FormProvider>
  );
}

const notifyCheckbox = () => {
  const boxes = screen.getAllByRole('checkbox');
  expect(boxes).toHaveLength(1);
  return boxes[0]!;
};

describe('AssignedDraftNotifySettingsBlock', () => {
  describe('toggle accent (primary vs warning)', () => {
    it('uses primary DaisyUI toggle when drafts are shown in list', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: true, showDraftsInList: true },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox().className).toContain('toggle-primary');
      expect(notifyCheckbox().className).not.toContain('toggle-warning');
    });

    it('uses primary toggle when drafts are hidden and user has not turned notify on', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList={false}
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox().className).toContain('toggle-primary');
      expect(notifyCheckbox().className).not.toContain('toggle-warning');
    });

    it('uses warning DaisyUI toggle when drafts are hidden and user turned notify on', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList={false}
          draftNotifyPreferred
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox().className).toContain('toggle-warning');
      expect(notifyCheckbox().className).not.toContain('toggle-primary');
    });
  });

  describe('checked state', () => {
    it('when list visible: reflects stored notifyOnDrafts only', () => {
      const off = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: true },
      });
      const { rerender } = render(
        <BlockHarness
          settings={off}
          showDraftsInList
          draftNotifyPreferred
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox()).toHaveProperty('checked', false);

      const on = mergeSettings({
        assigned: { notifyOnDrafts: true, showDraftsInList: true },
      });
      rerender(
        <BlockHarness
          settings={on}
          showDraftsInList
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox()).toHaveProperty('checked', true);
    });

    it('when list hidden: checked only from preference (stored notify ignored for display)', () => {
      const staleStoredOn = mergeSettings({
        assigned: { notifyOnDrafts: true, showDraftsInList: false },
      });
      const { rerender } = render(
        <BlockHarness
          settings={staleStoredOn}
          showDraftsInList={false}
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox()).toHaveProperty('checked', false);

      const bothOff = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      rerender(
        <BlockHarness
          settings={bothOff}
          showDraftsInList={false}
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox()).toHaveProperty('checked', false);

      rerender(
        <BlockHarness
          settings={bothOff}
          showDraftsInList={false}
          draftNotifyPreferred
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(notifyCheckbox()).toHaveProperty('checked', true);
    });
  });

  describe('status callout when list is hidden', () => {
    it('shows warning callout when preference is true (even if stored notify is false)', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList={false}
          draftNotifyPreferred
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      const status = screen.getByRole('status');
      expect(status.textContent).toContain('Draft notifications are disabled');
      expect(status.textContent).toContain('Show drafts in list');
    });

    it('hides callout when stored notify is true but preference false (no user opt-in while hidden)', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: true, showDraftsInList: false },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList={false}
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('hides callout when list hidden and both preference and stored notify are false', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList={false}
          draftNotifyPreferred={false}
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('never shows callout when list is visible', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: true, showDraftsInList: true },
      });
      render(
        <BlockHarness
          settings={settings}
          showDraftsInList
          draftNotifyPreferred
          setDraftNotifyPreferred={vi.fn()}
        />,
      );
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('user interactions', () => {
    it('when list visible: toggling updates react-hook-form notifyOnDrafts', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: true },
      });
      let methodsRef: ReturnType<typeof useForm<ExtensionSettings>> | null = null;

      function CaptureMethods() {
        const methods = useForm<ExtensionSettings>({ defaultValues: settings, values: settings });
        methodsRef = methods;
        return (
          <FormProvider {...methods}>
            <AssignedDraftNotifySettingsBlock
              control={methods.control}
              showDraftsInList
              draftNotifyPreferred={false}
              setDraftNotifyPreferred={vi.fn()}
            />
          </FormProvider>
        );
      }

      render(<CaptureMethods />);
      fireEvent.click(notifyCheckbox());
      expect(methodsRef!.getValues('assigned.notifyOnDrafts')).toBe(true);
    });

    it('when list hidden: toggling only updates preference callback, not stored field', () => {
      const setPref = vi.fn();
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      let methodsRef: ReturnType<typeof useForm<ExtensionSettings>> | null = null;

      function CaptureMethods() {
        const methods = useForm<ExtensionSettings>({ defaultValues: settings, values: settings });
        methodsRef = methods;
        return (
          <FormProvider {...methods}>
            <AssignedDraftNotifySettingsBlock
              control={methods.control}
              showDraftsInList={false}
              draftNotifyPreferred={false}
              setDraftNotifyPreferred={setPref}
            />
          </FormProvider>
        );
      }

      render(<CaptureMethods />);
      fireEvent.click(notifyCheckbox());
      expect(setPref).toHaveBeenCalledWith(true);
      expect(methodsRef!.getValues('assigned.notifyOnDrafts')).toBe(false);
    });

    it('when list hidden: turning preference on via click surfaces callout (stateful parent)', () => {
      const settings = mergeSettings({
        assigned: { notifyOnDrafts: false, showDraftsInList: false },
      });
      render(
        <StatefulBlockHarness
          initialSettings={settings}
          showDraftsInList={false}
          initialDraftNotifyPreferred={false}
        />,
      );
      expect(screen.queryByRole('status')).toBeNull();
      fireEvent.click(notifyCheckbox());
      expect(screen.getByRole('status').textContent).toContain('Show drafts in list');
    });
  });
});

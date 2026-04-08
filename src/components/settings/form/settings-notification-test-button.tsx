import { useCallback, useState } from 'react';
import { chromeExtensionService } from '../../../services/chrome-extension-service';
import {
  SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS,
  SETTINGS_TEST_ERROR_COOLDOWN,
  SETTINGS_TEST_ERROR_DISABLED,
} from '../../../../extension/common/constants';
import { SettingsTestCooldownRing } from './settings-test-cooldown-ring';
import { BellIcon } from '../../ui/icons';

type TestCategory = 'assigned' | 'merged';

interface SettingsNotificationTestButtonProps {
  /** `assigned` = To Review PRs channel; `merged` = merged PRs. */
  category: TestCategory;
  /** False when that section's notifications toggle is off. */
  disabled?: boolean;
}

/**
 * Sends a real extension notification + saved sound so users can verify OS permissions and audio.
 * Cooldown matches the service worker throttle; ring uses the same dash-offset approach as RefreshGlyph.
 */
export const SettingsNotificationTestButton = ({
  category,
  disabled = false,
}: SettingsNotificationTestButtonProps) => {
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const handleClick = useCallback(async () => {
    if (pending || cooldown || disabled) return;

    setPending(true);
    let startCooldown = false;
    try {
      await chromeExtensionService.testSettingsNotification(category);
      startCooldown = true;
    } catch (err) {
      if (err instanceof Error && err.message === SETTINGS_TEST_ERROR_COOLDOWN) {
        startCooldown = true;
      } else if (err instanceof Error && err.message === SETTINGS_TEST_ERROR_DISABLED) {
        // Parent should disable the button when off; no inline error per UX spec.
      } else {
        console.error('[SettingsNotificationTestButton] testSettingsNotification failed:', err);
      }
    } finally {
      setPending(false);
    }

    if (startCooldown) {
      setCooldown(true);
      window.setTimeout(() => setCooldown(false), SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS);
    }
  }, [category, cooldown, disabled, pending]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending || cooldown}
      className={`mt-[2px] inline-flex h-4.5 min-h-0 shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-base-100 px-1.5 py-0 text-[10px] font-medium leading-none text-primary ${
        disabled || pending || cooldown
          ? 'opacity-55 hover:cursor-default'
          : 'hover:bg-base-200 hover:cursor-pointer'
      }`}
    >
      <BellIcon className="size-2.5" />
      <span className="mb-[0.5px]">Preview</span>
      {cooldown ? <SettingsTestCooldownRing active /> : null}
    </button>
  );
};

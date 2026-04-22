import { useCallback, useState } from 'react';
import { BellIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { animated, useTransition } from '@react-spring/web';
import { chromeExtensionService } from '../../../../services/chrome-extension-service';
import {
  SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS,
  SETTINGS_TEST_ERROR_CHROME_DENIED,
  SETTINGS_TEST_ERROR_COOLDOWN,
  SETTINGS_TEST_ERROR_DISABLED,
} from '../../../../../extension/common/constants';
import { usePrefersReducedMotion } from '../../../../hooks/use-prefers-reduced-motion';
import { SETTINGS_SPRING_SNAPPY } from '../../shared/animation/settings-motion';
import { SettingsNoticeTransition } from '../../shared/components/settings-notice-transition';
import { SettingsTestCooldownRing } from './settings-test-cooldown-ring';

type TestCategory = 'assigned' | 'merged';

interface SettingsNotificationTestButtonProps {
  /** `assigned` = To Review PRs channel; `merged` = merged PRs. */
  category: TestCategory;
  /** False when that section's notifications toggle is off. */
  disabled?: boolean;
}

/** URL in the error notice — not `<a href>` because chrome:// is blocked in extension popup CSP; use tabs.create. */
const CHROME_NOTIFICATION_SETTINGS_URL = 'chrome://settings/content/notifications';

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

  /**
   * WHY [ephemeral only]: Never persisted — popup close unmounts and clears; avoids a stale notice
   * after the user fixes Chrome and returns without clicking Preview again.
   *
   * WHY [per-instance scope]: Each category mounts its own button; denied state in one row does not
   * affect the other.
   */
  const [chromeDenied, setChromeDenied] = useState(false);

  const prefersReducedMotion = usePrefersReducedMotion();

  const handleClick = useCallback(async () => {
    if (pending || cooldown || disabled) return;

    setPending(true);
    let startCooldown = false;
    try {
      await chromeExtensionService.testSettingsNotification(category);
      startCooldown = true;
      // WHY [clear on success]: Re-enabling Chrome notifications then Preview must hide the notice immediately.
      setChromeDenied(false);
    } catch (err) {
      if (err instanceof Error && err.message === SETTINGS_TEST_ERROR_COOLDOWN) {
        startCooldown = true;
      } else if (err instanceof Error && err.message === SETTINGS_TEST_ERROR_DISABLED) {
        // Parent should disable the button when off; no inline error per UX spec.
      } else if (err instanceof Error && err.message === SETTINGS_TEST_ERROR_CHROME_DENIED) {
        // WHY [Preview-only]: Shown only when the service worker returns this code after a Preview click —
        // not on mount, not for OS-level suppression (getPermissionLevel does not detect that).
        setChromeDenied(true);
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

  /**
   * WHY [tabs.create not href]: Extension popup CSP blocks chrome:// in anchors; `chrome.tabs.create`
   * does not require the `"tabs"` manifest permission (same pattern as other call sites in this repo).
   *
   * WHY [list URL]: No stable deep link to one extension row in Chrome settings — open the notifications page.
   */
  const handleOpenChromeSettings = useCallback(() => {
    chrome.tabs.create({ url: CHROME_NOTIFICATION_SETTINGS_URL, active: true });
  }, []);

  const iconTransitions = useTransition(cooldown, {
    from: { opacity: 0, scale: 0.7 },
    enter: { opacity: 1, scale: 1 },
    leave: { opacity: 0, scale: 0.7 },
    config: SETTINGS_SPRING_SNAPPY,
    immediate: prefersReducedMotion,
  });

  const isBusy = disabled || pending || cooldown;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        aria-busy={pending}
        data-idle={isBusy ? undefined : ''}
        className={`pw-preview-button mt-[2px] inline-flex h-4.5 min-h-0 shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-base-100 px-1.5 py-0 text-[10px] font-medium leading-none text-primary transition-transform duration-150 aria-busy:scale-[0.97] ${
          isBusy ? 'opacity-55 hover:cursor-default' : 'hover:bg-base-200 hover:cursor-pointer'
        }`}
      >
        <span className="relative inline-flex size-2.5 shrink-0 items-center justify-center">
          {iconTransitions((style, showCooldown) => (
            <animated.span
              style={{
                ...style,
                position: 'absolute',
                inset: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden
            >
              {showCooldown ? (
                <SettingsTestCooldownRing active viewSize={10} />
              ) : (
                <BellIcon className="pw-bell-icon size-2.5" strokeWidth={2} />
              )}
            </animated.span>
          ))}
        </span>
        <span className="mb-[0.5px]">Preview</span>
      </button>

      {/* WHY [inline not tooltip]: Actionable steps need to stay visible until the next successful Preview. */}
      <SettingsNoticeTransition
        visible={chromeDenied}
        className="w-[313px] mt-2 flex items-start gap-2.5 rounded-lg border border-base-300 border-l-[3px] border-l-error bg-base-200 px-3 py-2.5"
      >
        <ExclamationCircleIcon className="size-5 shrink-0 text-error" />
        <div className="min-w-0 text-xs font-medium leading-snug text-base-content">
          <p>Chrome is blocking notifications for this extension. Enable them in:</p>
          <p className="mt-1.5">
            <code className="break-all rounded bg-base-300/40 px-1.5 py-0.5 font-mono text-[11px] text-primary select-text">
              {CHROME_NOTIFICATION_SETTINGS_URL}
            </code>
          </p>
          <button
            type="button"
            onClick={handleOpenChromeSettings}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            Open notification settings ↗
          </button>
        </div>
      </SettingsNoticeTransition>
    </div>
  );
};

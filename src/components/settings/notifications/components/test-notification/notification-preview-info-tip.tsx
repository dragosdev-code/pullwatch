import { useState } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

const TOOLTIP_ARIA =
  'Visual alerts require OS notifications enabled for your browser. Sounds still play for real alerts and Previews even if banners are hidden.';

/**
 * Module-level so the breathe plays only the first time this component mounts in a popup
 * session. Chrome popups recreate the DOM on every open, so the flag resets naturally on
 * each user-initiated popup open — and does *not* replay when the settings overlay is
 * closed and reopened within the same popup.
 */
let breatheConsumed = false;

/**
 * Hover help beside Preview when notifications are enabled.
 * WHY [OS-only copy]: Browser-level permission UX lives on the Chrome-denied callout on Preview; this tip addresses
 * Focus Assist, DND, and per-app OS toggles, not chrome:// notification settings.
 */
export const NotificationPreviewInfoTip = () => {
  const [shouldBreathe] = useState(() => {
    if (breatheConsumed) return false;
    breatheConsumed = true;
    return true;
  });

  return (
    <div className="tooltip relative z-100 shrink-0 tooltip-bottom tooltip-neutral mt-[2px]">
      {/* WHY [-translate-x-3]: Default placement centers on the icon; shift left so the bubble sits more in the popup. */}
      <div className="tooltip-content z-10000 max-w-[min(280px,calc(100vw-3rem))] -translate-x-3 rounded-md px-0 py-0 text-left shadow-lg">
        {/* WHY [text-neutral-content]: Pairs with tooltip-neutral bubble (DaisyUI semantic fg on neutral surface; works across themes). */}
        <div className="space-y-3 rounded-md px-3 py-2.5 text-xs font-normal leading-relaxed whitespace-normal text-neutral-content">
          <p>
            Visual alerts require OS notifications to be enabled for your browser. System settings
            like <span className="font-semibold">Do Not Disturb</span> or{' '}
            <span className="font-semibold">Focus mode</span> will hide them.
          </p>
          {/* WHY [border + indent]: Separates the sound caveat without lowering opacity (keeps contrast). */}
          <p className="border-l-2 border-neutral-content/25 pl-2.5 text-[11px] leading-relaxed">
            If sounds are enabled here, you will still hear audio for both actual PR alerts and
            Previews, even if the OS hides the visual banner.
          </p>
        </div>
      </div>
      <span
        role="img"
        aria-label={TOOLTIP_ARIA}
        className="pw-tip-trigger relative top-[2px] inline-flex cursor-default text-base-content/55 hover:text-base-content/80"
      >
        <InformationCircleIcon
          className={`pw-tip-icon size-4.5 ${shouldBreathe ? 'pw-tip-icon--breathe' : ''}`}
          aria-hidden
        />
      </span>
    </div>
  );
};

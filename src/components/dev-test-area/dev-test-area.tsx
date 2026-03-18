import { useState } from 'react';
import { InstantNotificationPanel } from './instant-notification-panel';
import { NotificationLooperPanel } from './notification-looper-panel';
import { AlarmOverridePanel } from './alarm-override-panel';
import { ScraperUrlPanel } from './scraper-url-panel';
import { AutoSaveIndicator } from './auto-save-indicator';
import {
  useNotificationRevision,
  useLooperRevision,
  useAlarmOverrideRevision,
} from './use-dev-test-settings';

type SectionKey = 'notification' | 'looper' | 'alarm' | 'urls';

export const DevTestArea = () => {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    notification: true,
    looper: false,
    alarm: false,
    urls: false,
  });

  const notificationRevision = useNotificationRevision();
  const looperRevision = useLooperRevision();
  const alarmOverrideRevision = useAlarmOverrideRevision();

  const toggle = (key: SectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="border-b-2 border-warning/60 bg-warning/5">
      {/* Danger banner */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/15 border-b border-warning/30">
        <svg
          className="w-3.5 h-3.5 text-warning flex-shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-[10px] font-bold text-warning uppercase tracking-widest">
          Developer Test Area
        </span>
      </div>

      {/* Scrollable body */}
      <div className="px-3 py-2 space-y-1 max-h-[200px] overflow-y-auto">
        <CollapsibleSection
          label="Instant Notification"
          open={open.notification}
          onToggle={() => toggle('notification')}
          revision={notificationRevision}
        >
          <InstantNotificationPanel />
        </CollapsibleSection>

        <CollapsibleSection
          label="Notification Looper"
          open={open.looper}
          onToggle={() => toggle('looper')}
          revision={looperRevision}
        >
          <NotificationLooperPanel />
        </CollapsibleSection>

        <CollapsibleSection
          label="Alarm Override"
          open={open.alarm}
          onToggle={() => toggle('alarm')}
          revision={alarmOverrideRevision}
        >
          <AlarmOverridePanel />
        </CollapsibleSection>

        <CollapsibleSection label="Scraper URLs" open={open.urls} onToggle={() => toggle('urls')}>
          <ScraperUrlPanel />
        </CollapsibleSection>
      </div>
    </div>
  );
};

function CollapsibleSection({
  label,
  open,
  onToggle,
  revision,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  revision?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-base-300/60">
      <button
        className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-base-200/50 transition-colors"
        onClick={onToggle}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-warning uppercase tracking-wide">
            {label}
          </span>
          {revision !== undefined && <AutoSaveIndicator revision={revision} />}
        </span>
        <svg
          className={`w-3 h-3 text-base-content/50 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

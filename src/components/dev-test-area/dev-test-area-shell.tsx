import { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { AlarmOverridePanel } from './components/alarm-override-panel';
import { DevTestCollapsibleSection } from './components/dev-test-collapsible-section';
import { InstantNotificationPanel } from './components/instant-notification-panel';
import { NotificationLooperPanel } from './components/notification-looper-panel';
import { ScraperUrlPanel } from './components/scraper-url-panel';
import {
  useAlarmOverrideRevision,
  useLooperRevision,
  useNotificationRevision,
} from './store/dev-test-settings-store';
import type { DevTestSectionKey } from './types';

export function DevTestAreaShell() {
  const [open, setOpen] = useState<Record<DevTestSectionKey, boolean>>({
    notification: true,
    looper: false,
    alarm: false,
    urls: false,
  });

  const notificationRevision = useNotificationRevision();
  const looperRevision = useLooperRevision();
  const alarmOverrideRevision = useAlarmOverrideRevision();

  const toggle = (key: DevTestSectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="border-b-2 border-warning/60 bg-warning/5">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/15 border-b border-warning/30">
        <ExclamationTriangleIcon className="w-3.5 h-3.5 text-warning shrink-0" />
        <span className="text-[10px] font-bold text-warning uppercase tracking-widest">
          Developer Test Area
        </span>
      </div>

      <div className="px-3 py-2 space-y-1 max-h-[200px] overflow-y-auto">
        <DevTestCollapsibleSection
          label="Instant Notification"
          open={open.notification}
          onToggle={() => toggle('notification')}
          revision={notificationRevision}
        >
          <InstantNotificationPanel />
        </DevTestCollapsibleSection>

        <DevTestCollapsibleSection
          label="Notification Looper"
          open={open.looper}
          onToggle={() => toggle('looper')}
          revision={looperRevision}
        >
          <NotificationLooperPanel />
        </DevTestCollapsibleSection>

        <DevTestCollapsibleSection
          label="Alarm Override"
          open={open.alarm}
          onToggle={() => toggle('alarm')}
          revision={alarmOverrideRevision}
        >
          <AlarmOverridePanel />
        </DevTestCollapsibleSection>

        <DevTestCollapsibleSection
          label="Scraper URLs"
          open={open.urls}
          onToggle={() => toggle('urls')}
        >
          <ScraperUrlPanel />
        </DevTestCollapsibleSection>
      </div>
    </div>
  );
}

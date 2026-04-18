import { SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS } from '../../../../../extension/common/constants';
import { DurationRadialRing } from '../../../ui/duration-radial-ring';

interface SettingsTestCooldownRingProps {
  active: boolean;
  /** Rendered SVG width/height; defaults to `DurationRadialRing`'s 14px when omitted. */
  viewSize?: number;
}

export function SettingsTestCooldownRing({ active, viewSize }: SettingsTestCooldownRingProps) {
  return (
    <DurationRadialRing
      active={active}
      durationMs={SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS}
      viewSize={viewSize}
    />
  );
}

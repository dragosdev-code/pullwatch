import { SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS } from '../../../../extension/common/constants';
import { DurationRadialRing } from '../../ui/duration-radial-ring';

interface SettingsTestCooldownRingProps {
  active: boolean;
}

export function SettingsTestCooldownRing({ active }: SettingsTestCooldownRingProps) {
  return (
    <DurationRadialRing active={active} durationMs={SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS} />
  );
}

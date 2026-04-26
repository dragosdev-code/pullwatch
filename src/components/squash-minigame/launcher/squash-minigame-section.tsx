import { SettingsSection } from '../../settings/shared/components/settings-section';
import { useMinigameDiscovery } from '../hooks/use-minigame-discovery';
import { NeoTerminalLauncher } from './neo-terminal-launcher';

/**
 * Settings page entry point. Hidden until the user opts in (`stats.hasDiscovered` via
 * {@link useMinigameDiscovery}'s `discoverMinigame`), after the popup-open CTA threshold.
 * Renders nothing while stats hydrate to avoid a flash of the section as the popup boots.
 */
export function SquashMinigameSection() {
  const { stats, ready } = useMinigameDiscovery();

  if (!ready || !stats) return null;
  if (!stats.hasDiscovered) return null;

  return (
    <SettingsSection title="Squash the Bugs">
      <NeoTerminalLauncher stats={stats} />
    </SettingsSection>
  );
}

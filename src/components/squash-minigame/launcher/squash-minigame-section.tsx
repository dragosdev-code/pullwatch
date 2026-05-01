// import { SettingsSection } from '../../settings/shared/components/settings-section';
import { useSquashMinigameExperience } from '../squash-minigame-experience-provider';
import { NeoTerminalLauncher } from './neo-terminal-launcher';

/**
 * Settings page entry point. Hidden until the user opts in (`stats.hasDiscovered` via
 * `discoverMinigame`), after the popup-open CTA threshold.
 * Renders nothing while stats hydrate to avoid a flash of the section as the popup boots.
 */
export function SquashMinigameSection() {
  const { stats, ready, openSquashGame } = useSquashMinigameExperience();

  if (!ready || !stats) return null;
  if (!stats.hasDiscovered) return null;

  return <NeoTerminalLauncher stats={stats} onRequestPlayMode={openSquashGame} />;
}

import { useMinigameDiscovery } from './hooks/use-minigame-discovery';

/**
 * Mounts {@link useMinigameDiscovery} so the popup open counter ticks once per popup launch.
 *
 * Renders nothing; `hasDiscovered` is set only via `discoverMinigame` on
 * {@link useMinigameDiscovery} (header CTA / launcher), not from the open count alone.
 */
export const MinigameDiscoveryProbe = () => {
  useMinigameDiscovery();
  return null;
};

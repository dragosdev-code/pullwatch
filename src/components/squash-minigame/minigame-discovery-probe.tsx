import { useMinigameDiscovery } from './hooks/use-minigame-discovery';

/**
 * Mounts {@link useMinigameDiscovery} so the popup open counter ticks once per popup launch.
 *
 * Phase 1 only: renders nothing. The launcher UI gated on `stats.hasDiscovered` lands in Phase 5.
 */
export const MinigameDiscoveryProbe = () => {
  useMinigameDiscovery();
  return null;
};

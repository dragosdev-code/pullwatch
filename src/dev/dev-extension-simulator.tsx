import { useEffect } from 'react';
import { isExtensionContext } from '@src/utils/is-extension-context';
import { useSquashMinigameExperience } from '@src/components/squash-minigame/squash-minigame-experience-provider';

/**
 * Dev affordances mounted only when running outside a Chrome extension context (plain
 * `vite dev` tab). The popup-size simulation class is applied synchronously by
 * `public/popup-size-init.js` before React boots so the first paint is already centered.
 */
export default function DevExtensionSimulator() {
  const { ready, stats, discoverMinigame } = useSquashMinigameExperience();

  useEffect(() => {
    if (isExtensionContext()) return;
    if (!ready || !stats) return;
    if (stats.hasDiscovered) return;
    void discoverMinigame();
  }, [ready, stats, discoverMinigame]);

  return null;
}

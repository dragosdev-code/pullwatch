/**
 * Coordinates which `SoundPreviewButton` instance “owns” the single offscreen audio pipeline.
 *
 * **Why this exists:** Preview audio is not rendered inside React—it is played in one offscreen
 * `AudioContext` via the service worker. Each button still keeps local `isPlaying` state, so two
 * mounted buttons (e.g. settings row + picker modal) could both show the wave while only one
 * pipeline runs, and one global `sound.stopPreview()` would desync the other. This module makes
 * ownership explicit: at most one `clientId` is active; everyone else resets when someone claims.
 *
 * @module sound-preview-session
 */

import { chromeExtensionService } from '@common/chrome-extension-service';

/** The `useId()` of the button currently allowed to show “playing” after a successful claim. */
let activeClientId: string | null = null;

/** Subscribers re-check ownership synchronously—WHY: React state must drop the wave as soon as another control claims, without waiting for network. */
const listeners = new Set<() => void>();

/** Fan-out after claim/release so every mounted `SoundPreviewButton` can compare `getActivePreviewSessionId()` to its `useId()`. */
const notifyListeners = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

/**
 * Returns which preview client owns the session, or `null` if none.
 */
export const getActivePreviewSessionId = (): string | null => activeClientId;

/**
 * Subscribe to session changes (claim, release, or supersede). Unsubscribe with the returned fn.
 */
export const subscribePreviewSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Takes exclusive ownership: stops any current offscreen playback, sets this client as active,
 * then notifies others so they clear their playing UI and discard in-flight completion work.
 *
 * **Why stop first:** Clears the SW/offscreen tail before the next `sound.playPreview`, avoiding
 * overlapping preview messages when switching sounds quickly.
 */
export const claimPreviewSession = async (clientId: string): Promise<void> => {
  await chromeExtensionService.sound.stopPreview();
  activeClientId = clientId;
  notifyListeners();
};

/**
 * Drops ownership if this client is active. Notifies so all buttons re-sync (e.g. after stop).
 * WHY the id check: only the owner may clear `activeClientId`—otherwise a stale unmount or duplicate release could wipe a newer session.
 */
export const releasePreviewSession = (clientId: string): void => {
  if (activeClientId !== clientId) {
    return;
  }
  activeClientId = null;
  notifyListeners();
};

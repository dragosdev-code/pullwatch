import { POPUP_HEIGHT_CSS_VAR, POPUP_WIDTH_CSS_VAR } from '@src/constants/popup-sizes';

/**
 * WHY [700×600]: Chrome extension popups cap at 800×600; this fits the board comfortably while
 * staying under the limit (`chrome.action` sizing docs). Values are applied only as CSS vars
 * during a session — never written to `POPUP_SIZE_STORAGE_KEY`.
 */
export const MINIGAME_SESSION_POPUP_WIDTH_PX = 700;
export const MINIGAME_SESSION_POPUP_HEIGHT_PX = 600;

export function applyMinigameSessionPopupDimensions(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty(POPUP_WIDTH_CSS_VAR, `${MINIGAME_SESSION_POPUP_WIDTH_PX}px`);
  root.style.setProperty(POPUP_HEIGHT_CSS_VAR, `${MINIGAME_SESSION_POPUP_HEIGHT_PX}px`);
}

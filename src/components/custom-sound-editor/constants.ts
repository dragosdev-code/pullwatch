// ---------------------------------------------------------------------------
// Waveform editor constants — single source of truth for tunable numbers.
// Adjusting waveform feel (scroll speed, zoom range) requires changing
// only this file.
// ---------------------------------------------------------------------------

/** Minimum zoom level (1× = waveform fits the scroll viewport exactly). */
export const MIN_WAVEFORM_ZOOM = 1;

/** Maximum zoom level (10× = waveform is ten times the viewport width). */
export const MAX_WAVEFORM_ZOOM = 10;

/**
 * Fallback width in CSS pixels when the scroll container hasn't been
 * measured yet (e.g. before the first ResizeObserver callback fires).
 */
export const WAVEFORM_VIEWPORT_FALLBACK_PX = 320;

/**
 * Width in CSS pixels of the auto-scroll trigger zone on each edge
 * of the scroll viewport. When the pointer enters this band during a
 * drag, the viewport begins auto-scrolling in that direction.
 */
export const EDGE_SCROLL_MARGIN_PX = 50;

/** Pixels per rAF frame the viewport scrolls during edge-scroll. */
export const EDGE_SCROLL_SPEED_PX = 5;

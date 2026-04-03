import { EDGE_SCROLL_MARGIN_PX } from '../constants';
import type { EdgeScrollDir } from '../types';

/**
 * Returns the responsive hit-test margin for trim handles in CSS pixels.
 *
 * WHY dynamic: on narrow viewports (mobile / low zoom), a fixed 12px margin
 * makes handles nearly impossible to grab; on wide canvases it feels too
 * sticky. 2.5% of canvas width, clamped to 8–12px, balances touch ergonomics
 * with precision across all viewport sizes.
 */
export const hitMarginPx = (canvasWidth: number): number =>
  Math.max(8, Math.min(12, canvasWidth * 0.025));

/**
 * Builds an `oklch(L C H / alpha)` color string from a DaisyUI CSS variable value.
 *
 * WHY this exists: DaisyUI 4 exposes `--color-*` as complete `oklch(…)` strings
 * (e.g. `oklch(0.45 0.24 277)`). CSS natively allows `oklch(from var(…) l c h / a)`
 * only with relative color syntax (limited browser support). This helper manually
 * unwraps the `oklch(…)` wrapper, strips any existing alpha channel, and re-wraps
 * with the requested alpha — giving us theme-aware translucent colors everywhere
 * without relying on cutting-edge CSS features.
 */
export const oklchWithAlpha = (
  themeColorValue: string,
  alpha: number,
  fallbackChannels: string,
): string => {
  const raw = (themeColorValue || '').trim() || fallbackChannels;
  const m = raw.match(/^oklch\(\s*(.+)\s*\)$/i);
  if (m) {
    const inner = m[1].trim().replace(/\s*\/\s*[\d.]+\s*$/i, '').trim();
    return `oklch(${inner} / ${alpha})`;
  }
  return `oklch(${raw} / ${alpha})`;
};

/**
 * Detects whether the pointer is in the left or right auto-scroll margin
 * of the waveform scroll container.
 *
 * WHY we return null when `clientX` is outside the container bounds: if the
 * pointer leaves the scroll container entirely (e.g. moves above or below),
 * we must NOT trigger edge scroll — that would cause runaway scrolling with
 * no way for the user to stop it by moving the pointer out of the margin band.
 *
 * WHY we check `scrollWidth <= clientWidth` first: if the content fits within
 * the viewport, there is nothing to scroll, so edge-scrolling would be a no-op
 * that wastes rAF cycles.
 */
export const getEdgeScrollDirection = (
  scrollEl: HTMLElement,
  clientX: number,
): EdgeScrollDir | null => {
  if (scrollEl.scrollWidth <= scrollEl.clientWidth) return null;
  const r = scrollEl.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right) return null;
  if (clientX <= r.left + EDGE_SCROLL_MARGIN_PX) return 'left';
  if (clientX >= r.right - EDGE_SCROLL_MARGIN_PX) return 'right';
  return null;
};

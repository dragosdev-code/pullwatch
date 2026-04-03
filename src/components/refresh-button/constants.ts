export const RING_RADIUS = 18;
export const RING_C = 2 * Math.PI * RING_RADIUS;

/** Hover/focus delay before opening DaisyUI tooltip (`tooltip-open`). */
export const TOOLTIP_SHOW_DELAY_MS = 600;

/**
 * DaisyUI shows tooltips on :hover and :focus-visible immediately.
 * We only reveal after TOOLTIP_SHOW_DELAY_MS via `tooltip-open`, so hide until then.
 */
export const TOOLTIP_DELAY_GUARD_CLASSES = [
  '[&:not(.tooltip-open):hover>.tooltip-content]:!opacity-0',
  '[&:not(.tooltip-open):hover>.tooltip-content]:!pointer-events-none',
  '[&:not(.tooltip-open):hover]:after:!opacity-0',
  '[&:not(.tooltip-open):has(:focus-visible)>.tooltip-content]:!opacity-0',
  '[&:not(.tooltip-open):has(:focus-visible)>.tooltip-content]:!pointer-events-none',
  '[&:not(.tooltip-open):has(:focus-visible)]:after:!opacity-0',
].join(' ');

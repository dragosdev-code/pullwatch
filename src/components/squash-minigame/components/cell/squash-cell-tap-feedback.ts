/**
 * Tap feedback for the squash grid cell, implemented with the Web Animations API so each activation
 * starts a fresh Animation — no React state or class toggles. Timing matches the former squash cell
 * keyframes that lived in `app.css` before feedback moved to WAAPI.
 */

const GLYPH_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(0.3)', offset: 0.4 },
  { transform: 'scale(1)' },
];

const GLYPH_OPTIONS: KeyframeAnimationOptions = {
  duration: 150,
  easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  fill: 'both',
};

const SHELL_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(0.9)', offset: 0.5 },
  { transform: 'scale(1)' },
];

const SHELL_OPTIONS: KeyframeAnimationOptions = {
  duration: 200,
  easing: 'cubic-bezier(0.25, 0.9, 0.35, 1)',
  fill: 'both',
};

function cancelRunningAnimations(el: HTMLElement) {
  if (typeof el.getAnimations !== 'function') return;
  for (const anim of el.getAnimations()) {
    anim.cancel();
  }
}

/**
 * Plays shell + glyph scale feedback. Safe to call on every tap; cancels prior runs on the same
 * nodes so rapid input restarts cleanly. No-op when `prefers-reduced-motion` or WAAPI is missing.
 */
export function playSquashCellTapFeedback(
  shell: HTMLButtonElement,
  glyph: HTMLElement | null,
  reducedMotion: boolean
): void {
  if (reducedMotion) return;
  if (typeof shell.animate !== 'function') return;

  cancelRunningAnimations(shell);
  if (glyph) cancelRunningAnimations(glyph);

  shell.animate(SHELL_KEYFRAMES, SHELL_OPTIONS);
  if (glyph) {
    glyph.animate(GLYPH_KEYFRAMES, GLYPH_OPTIONS);
  }
}

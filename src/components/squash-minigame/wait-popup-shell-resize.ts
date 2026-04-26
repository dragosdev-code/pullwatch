/**
 * Resolves after `html` min-width + min-height transitions finish (see `app.css`), or `timeoutMs`.
 *
 * WHY [filter propertyName]: `transitionend` fires once per property; `html` animates both
 * dimensions, so we wait until both have completed (MDN / Sparkbox guidance).
 */
export function waitForPopupShellResizeComplete(
  root: HTMLElement,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      root.removeEventListener('transitionend', onEnd);
      window.clearTimeout(timer);
      resolve();
    };

    const pending = new Set(['min-width', 'min-height']);
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== root) return;
      if (!pending.has(e.propertyName)) return;
      pending.delete(e.propertyName);
      if (pending.size === 0) done();
    };

    root.addEventListener('transitionend', onEnd);
    const timer = window.setTimeout(done, timeoutMs);
  });
}

export function popupResizeFallbackTimeoutMs(): number {
  if (typeof document === 'undefined') return 500;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--pw-popup-resize-duration')
    .trim();
  const match = /^([\d.]+)ms$/i.exec(raw);
  const base = match ? Number(match[1]) : 380;
  return Math.ceil(base) + 120;
}

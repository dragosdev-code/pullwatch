const APP_ROOT_ID = 'pw-app-root';
const MIRROR_CLASS = 'pw-theme-mirror';
const CLONE_CLASS = 'pw-theme-mirror-clone';
const RADIUS_PAD_PX = 8;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DEFAULT_THEME = 'light';

// Only one reveal can be in flight — subsequent clicks restart from the new origin.
let activeMirror: HTMLDivElement | null = null;

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
};

// cloneNode copies attributes but not scroll offsets. `scrollTop`/`scrollLeft` are
// live layout-dependent properties — setting them on a detached node is a silent
// no-op, so this MUST run after the clone is in the document.
const copyScrollPositions = (src: Element, dst: Element): void => {
  const srcNodes = src.querySelectorAll<HTMLElement>('*');
  const dstNodes = dst.querySelectorAll<HTMLElement>('*');
  const len = Math.min(srcNodes.length, dstNodes.length);
  for (let i = 0; i < len; i++) {
    const s = srcNodes[i];
    if (s.scrollTop || s.scrollLeft) {
      dstNodes[i].scrollTop = s.scrollTop;
      dstNodes[i].scrollLeft = s.scrollLeft;
    }
  }
};

const maxCornerDistance = (origin: { x: number; y: number }): number => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    Math.hypot(Math.max(origin.x, vw - origin.x), Math.max(origin.y, vh - origin.y)) +
    RADIUS_PAD_PX
  );
};

const buildMirror = (
  source: HTMLElement,
  theme: string,
  origin: { x: number; y: number },
  radius: number
): { mirror: HTMLDivElement; clone: HTMLElement } => {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.classList.add(CLONE_CLASS);
  clone.inert = true;

  const mirror = document.createElement('div');
  mirror.className = MIRROR_CLASS;
  mirror.setAttribute('data-theme', theme);
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.setProperty('--pw-ripple-x', `${origin.x}px`);
  mirror.style.setProperty('--pw-ripple-y', `${origin.y}px`);
  mirror.style.setProperty('--pw-ripple-max', `${radius}px`);
  mirror.appendChild(clone);
  return { mirror, clone };
};

/**
 * Circular-reveal theme swap without the View Transitions API.
 *
 * A snapshot of the live app (cloned DOM, tagged with the pre-swap `data-theme`)
 * is mounted as a fixed, pointer-events:none overlay; `apply()` flips the theme
 * on `:root` so the live tree is instantly in the new theme and fully interactive.
 * The overlay's `clip-path` shrinks from a full-coverage circle at `origin` to 0,
 * revealing the new theme underneath.
 *
 * Rapid-click strategy: the in-flight mirror is detached before a new one is
 * mounted — each click reveals from the element the user just pressed.
 */
export const runThemeRipple = (
  origin: { x: number; y: number },
  apply: () => void
): void => {
  const appRoot = document.getElementById(APP_ROOT_ID) as HTMLElement | null;
  if (!appRoot || prefersReducedMotion()) {
    apply();
    return;
  }

  const oldTheme = document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME;
  const { mirror, clone } = buildMirror(appRoot, oldTheme, origin, maxCornerDistance(origin));

  activeMirror?.remove();
  activeMirror = mirror;
  document.body.appendChild(mirror);
  // Scroll offsets only stick once the clone is attached and laid out.
  copyScrollPositions(appRoot, clone);
  apply();

  mirror.addEventListener(
    'animationend',
    () => {
      if (activeMirror === mirror) activeMirror = null;
      mirror.remove();
    },
    { once: true }
  );
};

import type { CSSProperties } from 'react';

/** Hardcoded surface — DaisyUI tokens must not leak into onboarding overlays. */
export const ONBOARDING_IRIDESCENT_ROOT_STYLE: CSSProperties = {
  backgroundColor: '#14081c',
  backgroundImage: `
    radial-gradient(ellipse 130% 90% at 12% -10%, rgba(255, 210, 190, 0.42), transparent 52%),
    radial-gradient(ellipse 100% 70% at 88% 8%, rgba(120, 235, 255, 0.38), transparent 48%),
    radial-gradient(ellipse 90% 75% at 48% 108%, rgba(210, 150, 255, 0.45), transparent 55%),
    radial-gradient(ellipse 60% 50% at 72% 42%, rgba(255, 120, 200, 0.18), transparent 50%),
    linear-gradient(
      152deg,
      #12061a 0%,
      #241038 18%,
      #3a1f5c 36%,
      #4a2870 48%,
      #2a4a72 62%,
      #1a3550 78%,
      #0f1a28 100%
    )
  `,
};

export const ONBOARDING_TEXT_PRIMARY = '#f8f4ff';
export const ONBOARDING_TEXT_MUTED = 'rgba(248, 244, 255, 0.78)';
export const ONBOARDING_TEXT_SOFT = 'rgba(248, 244, 255, 0.62)';

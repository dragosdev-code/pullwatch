/**
 * Shared motion vocabulary for the settings surface.
 *
 * Mirrors the intent of [`TAB_SPRING_CONFIG`](../../../ui/tabs/tabs-config.ts): one place
 * to keep spring tensions and easings so every polish touch across settings reads as one
 * design language instead of a pile of one-off values.
 */

import type { SpringConfig } from '@react-spring/web';

/** Crisp settle with a hint of overshoot — for toggle halos, link-pill, preview icon swap. */
export const SETTINGS_SPRING_SNAPPY: SpringConfig = { tension: 360, friction: 28 };

/** Calmer ease-out feel — for banners, swatches, and the sound-picker confirm bar. */
export const SETTINGS_SPRING_SOFT: SpringConfig = { tension: 210, friction: 26 };

export const SETTINGS_DURATION_QUICK_MS = 140;
export const SETTINGS_DURATION_MED_MS = 220;

/** Matches `var(--pw-ease-out-expo)` declared in app.css. */
export const SETTINGS_EASE_OUT_EXPO = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Matches `var(--pw-ease-out-back)` declared in app.css. */
export const SETTINGS_EASE_OUT_BACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

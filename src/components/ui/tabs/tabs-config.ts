/** Shared spring configuration used by both the tab indicator and content transitions. */
export const TAB_SPRING_CONFIG = { tension: 300, friction: 30 };

/** CSS transition that approximates the spring config. Duration derived from friction. */
const SPRING_DURATION_MS = Math.round(8000 / TAB_SPRING_CONFIG.friction);
export const TAB_INDICATOR_TRANSITION =
  `left ${SPRING_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), width ${SPRING_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;

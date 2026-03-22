/** react-spring config for new PR row entrance animation */
export const PR_ENTRANCE_SPRING_CONFIG = {
  tension: 700,
  friction: 25,
  mass: 0.1,
} as const;

export const PR_ENTRANCE_FROM_NEW = {
  opacity: 0,
  transform: 'translateY(-30px) scale(0.95)',
  filter: 'blur(1px)',
} as const;

export const PR_ENTRANCE_FROM_SKIP = {
  opacity: 1,
  transform: 'translateY(0px) scale(1)',
  filter: 'blur(0px)',
} as const;

export const PR_ENTRANCE_TO = {
  opacity: 1,
  transform: 'translateY(0px) scale(1)',
  filter: 'blur(0px)',
} as const;

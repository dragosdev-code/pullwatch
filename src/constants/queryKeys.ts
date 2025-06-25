/**
 * Centralized query keys for TanStack Query.
 * This ensures consistent cache key management across all hooks.
 */
export const queryKeys = {
  prs: ['prs'] as const,
  settings: ['settings'] as const,
  notifications: ['notifications'] as const,
} as const;

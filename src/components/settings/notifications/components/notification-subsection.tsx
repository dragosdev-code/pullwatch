import type { ReactNode } from 'react';

interface NotificationSubsectionProps {
  /** When false, children are dimmed and non-interactive (parent notifications off). */
  enabled: boolean;
  children: ReactNode;
}

/**
 * Indented block under an enable-notifications row; matches layout for sound + draft rows.
 */
export const NotificationSubsection = ({ enabled, children }: NotificationSubsectionProps) => (
  <div
    className={`border-l-2 border-primary/20 pl-3 ml-1 flex flex-col gap-3 ${
      enabled ? '' : 'opacity-40 pointer-events-none'
    }`}
  >
    {children}
  </div>
);

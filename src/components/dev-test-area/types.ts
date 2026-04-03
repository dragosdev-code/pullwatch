import type { ReactNode } from 'react';

export type DevTestSectionKey = 'notification' | 'looper' | 'alarm' | 'urls';

export type DevTestCollapsibleSectionProps = {
  label: string;
  open: boolean;
  onToggle: () => void;
  revision?: number;
  children: ReactNode;
};

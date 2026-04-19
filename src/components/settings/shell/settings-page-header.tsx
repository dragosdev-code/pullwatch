import type { ReactNode } from 'react';
import type { LinkOpenBehavior } from '../../../hooks/use-link-behavior';
import { SettingsCloseButton } from './settings-close-button';
import { SettingsSourceCodeLink } from './settings-source-code-link';

interface SettingsPageHeaderProps {
  onClose: () => void;
  linkBehavior: LinkOpenBehavior;
  children?: ReactNode;
}

export const SettingsPageHeader = ({ onClose, linkBehavior, children }: SettingsPageHeaderProps) => (
  <div className="flex w-full items-center gap-3 px-4 pt-3 pb-2 shrink-0">
    <div className="flex items-center gap-3 shrink-0">
      <SettingsCloseButton onClose={onClose} />
      <h1 className="text-base font-bold text-base-content leading-none">Settings</h1>
    </div>
    <div className="flex-1 min-w-0" aria-hidden />
    <div className="flex items-center justify-end gap-2 shrink-0">
      {children}
      <SettingsSourceCodeLink linkBehavior={linkBehavior} />
    </div>
  </div>
);

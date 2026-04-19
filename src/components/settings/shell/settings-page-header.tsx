import type { ReactNode } from 'react';
import type { LinkOpenBehavior } from '../../../hooks/use-link-behavior';
import { SettingsCloseButton } from './settings-close-button';
import { SettingsSourceCodeLink } from './settings-source-code-link';

interface SettingsPageHeaderProps {
  onClose: () => void;
  linkBehavior: LinkOpenBehavior;
  children?: ReactNode;
}

export const SettingsPageHeader = ({
  onClose,
  linkBehavior,
  children,
}: SettingsPageHeaderProps) => (
  <div className="flex w-full items-center gap-3 px-5 py-2.5 shrink-0 border-b border-base-300/90 bg-base-100">
    <div className="flex items-center gap-3 shrink-0">
      <SettingsCloseButton onClose={onClose} />
      <h1 className="text-sm font-semibold tracking-tight text-base-content leading-none">
        Settings
      </h1>
    </div>
    <div className="flex-1 min-w-0" aria-hidden />
    <div className="flex items-center justify-end gap-2 shrink-0">
      {children}
      <SettingsSourceCodeLink linkBehavior={linkBehavior} />
    </div>
  </div>
);

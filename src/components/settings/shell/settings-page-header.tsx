import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LinkOpenBehavior } from '../../../hooks/use-link-behavior';
import { SettingsSourceCodeLink } from './settings-source-code-link';

interface SettingsPageHeaderProps {
  onClose: () => void;
  linkBehavior: LinkOpenBehavior;
  children?: ReactNode;
}

export const SettingsPageHeader = ({ onClose, linkBehavior, children }: SettingsPageHeaderProps) => (
  <div className="flex w-full items-center gap-3 px-4 pt-3 pb-2 shrink-0">
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="p-1.5 rounded-lg hover:bg-base-300 text-base-content/50 hover:text-base-content transition-colors duration-200 cursor-pointer shrink-0"
        aria-label="Close settings"
      >
        <XMarkIcon className="size-4" strokeWidth={2} />
      </button>
      <h1 className="text-base font-bold text-base-content leading-none">Settings</h1>
    </div>
    <div className="flex-1 min-w-0" aria-hidden />
    <div className="flex items-center justify-end gap-2 shrink-0">
      {children}
      <SettingsSourceCodeLink linkBehavior={linkBehavior} />
    </div>
  </div>
);

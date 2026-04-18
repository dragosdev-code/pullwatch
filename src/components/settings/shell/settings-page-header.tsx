import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface SettingsPageHeaderProps {
  onClose: () => void;
  children?: ReactNode;
}

export const SettingsPageHeader = ({ onClose, children }: SettingsPageHeaderProps) => (
  <div className="flex items-center gap-3 px-4 pt-3 pb-2 shrink-0">
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
    {children}
  </div>
);

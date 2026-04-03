import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { AutoSaveIndicator } from './auto-save-indicator';
import type { DevTestCollapsibleSectionProps } from '../types';

export const DevTestCollapsibleSection = ({
  label,
  open,
  onToggle,
  revision,
  children,
}: DevTestCollapsibleSectionProps) => {
  return (
    <div className="rounded border border-base-300/60">
      <button
        className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-base-200/50 transition-colors"
        onClick={onToggle}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-warning uppercase tracking-wide">
            {label}
          </span>
          {revision !== undefined && <AutoSaveIndicator revision={revision} />}
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 text-base-content/50 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  );
};

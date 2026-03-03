import { useCallback } from 'react';
import type { LinkOpenBehavior } from '../../../hooks/use-link-behavior';

interface LinkBehaviorFieldProps {
  value: LinkOpenBehavior;
  onChange: (value: LinkOpenBehavior) => void;
}

interface BehaviorOption {
  value: LinkOpenBehavior;
  label: string;
  description: string;
}

const OPTIONS: BehaviorOption[] = [
  {
    value: 'foreground',
    label: 'Foreground',
    description: 'Switch to new tab, close popup',
  },
  {
    value: 'background',
    label: 'Background',
    description: 'Open silently, keep popup open',
  },
];

export const LinkBehaviorField = ({ value, onChange }: LinkBehaviorFieldProps) => {
  const handleSelect = useCallback(
    (newValue: LinkOpenBehavior) => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Title and description at the top */}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-base-content">Link opening behavior</span>
        <span className="text-xs text-base-content/50">Choose how PR links open when clicked</span>
      </div>

      {/* Choices below */}
      <div className="flex gap-1 p-1 bg-base-200 rounded-lg">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded-md text-sm transition-all duration-200 cursor-pointer ${
              value === option.value
                ? 'bg-base-100 text-base-content shadow-sm'
                : 'text-base-content/60 hover:text-base-content hover:bg-base-300/50'
            }`}
            aria-pressed={value === option.value}
          >
            <span className="font-medium leading-tight">{option.label}</span>
            <span
              className={`text-[10px] leading-tight ${
                value === option.value ? 'text-base-content/60' : 'text-base-content/40'
              }`}
            >
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

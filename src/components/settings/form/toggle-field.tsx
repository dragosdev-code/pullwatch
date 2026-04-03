import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import type { ExtensionSettings } from '../types';

interface ToggleFieldProps {
  name: string;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
}

export const ToggleField = ({ name, label, description, disabled = false }: ToggleFieldProps) => {
  const { register } = useFormContext<ExtensionSettings>();

  const titleRow =
    typeof label === 'string' ? (
      <span className="text-sm font-medium text-base-content leading-snug">{label}</span>
    ) : (
      label
    );

  return (
    <div
      className={`flex items-center justify-between gap-3 transition-opacity duration-200 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">{titleRow}</div>
        {description && (
          <span className="text-xs text-base-content/50 mt-0.5 leading-snug">{description}</span>
        )}
      </div>
      <input
        type="checkbox"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...register(name as any)}
        disabled={disabled}
        className="toggle toggle-sm toggle-primary shrink-0"
      />
    </div>
  );
};

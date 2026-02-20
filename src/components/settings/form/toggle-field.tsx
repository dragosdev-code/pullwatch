import { useFormContext } from 'react-hook-form';
import type { ExtensionSettings } from '../types';

interface ToggleFieldProps {
  name: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export const ToggleField = ({ name, label, description, disabled = false }: ToggleFieldProps) => {
  const { register } = useFormContext<ExtensionSettings>();

  return (
    <div
      className={`flex items-center justify-between gap-3 transition-opacity duration-200 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-slate-700 leading-snug">{label}</span>
        {description && (
          <span className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</span>
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

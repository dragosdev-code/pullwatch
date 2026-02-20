import { useFormContext } from 'react-hook-form';
import type { ExtensionSettings } from '../types';

interface SoundSelectFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
}

export const SoundSelectField = ({ name, label, disabled = false }: SoundSelectFieldProps) => {
  const { register } = useFormContext<ExtensionSettings>();

  return (
    <div
      className={`flex items-center justify-between gap-3 transition-opacity duration-200 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <span className="text-sm font-medium text-base-content">{label}</span>
      <select
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...register(name as any)}
        disabled={disabled}
        className="select select-sm text-xs cursor-pointer shrink-0 w-auto"
      >
        <option value="ping">Ping</option>
        <option value="bell">Bell</option>
        <option value="off">Off</option>
      </select>
    </div>
  );
};

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
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...register(name as any)}
        disabled={disabled}
        className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer shrink-0 transition-colors duration-150 hover:border-slate-300"
      >
        <option value="ping">Ping</option>
        <option value="bell">Bell</option>
        <option value="off">Off</option>
      </select>
    </div>
  );
};

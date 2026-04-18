import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import type { ExtensionSettings } from '../../types';

export type ToggleFieldColor = 'primary' | 'warning';

const toggleColorClass: Record<ToggleFieldColor, string> = {
  primary: 'toggle-primary',
  warning: 'toggle-warning',
};

export interface ToggleFieldLayoutProps {
  label: ReactNode;
  description?: string;
  disabled?: boolean;
  /** DaisyUI toggle accent when checked (`toggle-primary` vs `toggle-warning`). */
  toggleColor?: ToggleFieldColor;
  /** Renders the checkbox; receives full `toggle toggle-sm …` classes. */
  renderInput: (toggleClassName: string) => ReactNode;
}

/**
 * Presentational shell for settings toggles (label + optional description + switch).
 * Use with `register` via {@link ToggleField} or with `Controller` via `renderInput`.
 */
export const ToggleFieldLayout = ({
  label,
  description,
  disabled = false,
  toggleColor = 'primary',
  renderInput,
}: ToggleFieldLayoutProps) => {
  const titleRow =
    typeof label === 'string' ? (
      <span className="text-sm font-medium text-base-content leading-snug">{label}</span>
    ) : (
      label
    );

  const tone = toggleColorClass[toggleColor];
  const toggleClassName = `toggle toggle-sm ${tone} shrink-0`;

  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">{titleRow}</div>
        {description && (
          <span className="text-xs text-base-content/50 mt-0.5 leading-snug">{description}</span>
        )}
      </div>
      {renderInput(toggleClassName)}
    </div>
  );
};

interface ToggleFieldProps {
  name: string;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
  toggleColor?: ToggleFieldColor;
}

export const ToggleField = ({
  name,
  label,
  description,
  disabled = false,
  toggleColor = 'primary',
}: ToggleFieldProps) => {
  const { register } = useFormContext<ExtensionSettings>();

  return (
    <ToggleFieldLayout
      label={label}
      description={description}
      disabled={disabled}
      toggleColor={toggleColor}
      renderInput={(toggleClassName) => (
        <input
          type="checkbox"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...register(name as any)}
          disabled={disabled}
          className={toggleClassName}
        />
      )}
    />
  );
};

import { memo, useCallback, useRef, type MouseEvent } from 'react';
import { animated } from '@react-spring/web';
import { CheckIcon } from '@heroicons/react/24/outline';
import { ThemeSwatch } from './theme-swatch';
import { useMagneticHover } from '../hooks/use-magnetic-hover';
import type { RippleOrigin } from '../themes';

interface ThemeRowProps {
  name: string;
  isActive: boolean;
  disabled: boolean;
  magneticEnabled: boolean;
  registerButton: (name: string, el: HTMLButtonElement | null) => void;
  onSelect: (name: string, origin: RippleOrigin) => void;
}

export const ThemeRow = memo(function ThemeRow({
  name,
  isActive,
  disabled,
  magneticEnabled,
  registerButton,
  onSelect,
}: ThemeRowProps) {
  const swatchWrapRef = useRef<HTMLDivElement>(null);
  const magnet = useMagneticHover({ enabled: magneticEnabled && !disabled });

  const setButtonRef = useCallback(
    (el: HTMLButtonElement | null) => registerButton(name, el),
    [name, registerButton]
  );

  // Ripple origin is the swatch center, not the button — using the button rect
  // put the origin ~100px right of the 32px swatch on the full-width row.
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const rect =
      swatchWrapRef.current?.getBoundingClientRect() ??
      e.currentTarget.getBoundingClientRect();
    onSelect(name, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  return (
    <button
      ref={setButtonRef}
      type="button"
      disabled={disabled}
      onClick={handleClick}
      onPointerMove={magnet.onPointerMove}
      onPointerLeave={magnet.onPointerLeave}
      className={`flex items-center gap-3 px-4 py-2.5 w-full transition-all duration-150 cursor-pointer border-b border-base-200 last:border-b-0 disabled:cursor-not-allowed disabled:opacity-70 ${
        isActive
          ? 'bg-base-200/80 border-l-2 border-l-primary'
          : 'hover:bg-base-200/50 border-l-2 border-l-transparent'
      }`}
    >
      <animated.div style={{ display: 'inline-flex', transform: magnet.transform }}>
        <div ref={swatchWrapRef} className="inline-flex">
          <ThemeSwatch name={name} isActive={isActive} />
        </div>
      </animated.div>

      <span className="flex-1 text-sm text-left text-base-content capitalize">{name}</span>

      {isActive && <CheckIcon className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} />}
    </button>
  );
});

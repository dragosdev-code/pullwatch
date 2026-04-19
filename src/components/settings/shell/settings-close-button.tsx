import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { XMarkIcon } from '@heroicons/react/24/outline';

/** Long enough for settings overlay clip + content fade to finish before hover-spin can resume. */
const CLOSE_SPIN_RESET_MS = 1000;

const BUTTON_CLASS =
  'group p-1.5 rounded-lg shrink-0 cursor-pointer outline-none text-base-content/50 hover:text-primary hover:bg-base-300 transition-[color,background-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 motion-reduce:transition-none';

export const usePostCloseSpinSuppress = (durationMs: number) => {
  const [iconKey, setIconKey] = useState(0);
  const [suppressSpin, setSuppressSpin] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const arm = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIconKey((k) => k + 1);
    setSuppressSpin(true);
    timeoutRef.current = setTimeout(() => {
      setSuppressSpin(false);
      timeoutRef.current = null;
    }, durationMs);
  }, [durationMs]);

  return { iconKey, suppressSpin, arm };
};

interface SettingsCloseButtonProps {
  onClose: () => void;
}

export const SettingsCloseButton = ({ onClose }: SettingsCloseButtonProps) => {
  const { iconKey, suppressSpin, arm } = usePostCloseSpinSuppress(CLOSE_SPIN_RESET_MS);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    arm();
    onClose();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={BUTTON_CLASS}
      aria-label="Close settings"
    >
      <span
        className={clsx(
          'block transition-transform duration-300 ease-out motion-reduce:transition-none',
          suppressSpin
            ? 'translate-x-0 translate-y-0'
            : 'group-hover:translate-x-0 group-hover:translate-y-0 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0',
          'motion-reduce:translate-x-0 motion-reduce:translate-y-0'
        )}
        aria-hidden
      >
        <XMarkIcon
          key={iconKey}
          className={clsx(
            'size-4 motion-reduce:animate-none motion-reduce:[animation-play-state:paused]',
            suppressSpin
              ? 'animate-none rotate-0'
              : 'animate-[settings-spin_2.5s_linear_infinite] [animation-play-state:paused] group-hover:[animation-play-state:running] group-focus-visible:[animation-play-state:running]'
          )}
          strokeWidth={2}
          aria-hidden
        />
      </span>
    </button>
  );
};

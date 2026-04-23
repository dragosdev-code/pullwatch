import { useCallback, useLayoutEffect, useRef } from 'react';
import type { LinkOpenBehavior } from '../../../../hooks/use-link-behavior';
import { TAB_INDICATOR_TRANSITION } from '../../../ui/tabs/tabs-config';
import { usePrefersReducedMotion } from '../../../../hooks/use-prefers-reduced-motion';

interface LinkBehaviorFieldProps {
  value: LinkOpenBehavior;
  onChange: (value: LinkOpenBehavior) => void;
}

interface BehaviorOption {
  value: LinkOpenBehavior;
  label: string;
  description: string;
}

const OPTIONS: readonly BehaviorOption[] = [
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
  const prefersReducedMotion = usePrefersReducedMotion();

  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** First measurement must snap the pill into place instead of sliding in from 0. */
  const hasInitialized = useRef(false);

  const handleSelect = useCallback(
    (newValue: LinkOpenBehavior) => {
      onChange(newValue);
    },
    [onChange]
  );

  useLayoutEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const activeIndex = OPTIONS.findIndex((option) => option.value === value);
    const activeButton = buttonRefs.current[activeIndex];
    const pill = pillRef.current;
    if (!activeButton || !pill) return;

    const left = activeButton.offsetLeft;
    const width = activeButton.offsetWidth;
    if (width === 0) return;

    if (!hasInitialized.current || prefersReducedMotion) {
      pill.style.transition = 'none';
      pill.style.left = `${left}px`;
      pill.style.width = `${width}px`;
      void pill.offsetWidth;
      pill.style.transition = prefersReducedMotion ? 'none' : TAB_INDICATOR_TRANSITION;
      hasInitialized.current = true;
    } else {
      pill.style.left = `${left}px`;
      pill.style.width = `${width}px`;
    }
  }, [value, prefersReducedMotion]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-base-content">Link opening behavior</span>
        <span className="text-xs text-base-content/50">Choose how PR links open when clicked</span>
      </div>

      <div ref={trackRef} className="relative flex gap-1 p-1 bg-base-200 rounded-lg">
        <div
          ref={pillRef}
          aria-hidden
          className="absolute top-1 bottom-1 rounded-md bg-base-100 shadow-sm pointer-events-none"
          style={{
            left: 0,
            width: 0,
            transition: TAB_INDICATOR_TRANSITION,
          }}
        />
        {OPTIONS.map((option, index) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`relative z-10 flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors duration-150 ${
                isSelected
                  ? 'text-base-content'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
              aria-pressed={isSelected}
            >
              <span className="font-medium leading-tight">{option.label}</span>
              <span
                className={`text-[11px] leading-tight transition-colors duration-150 ${
                  isSelected ? 'text-base-content/60' : 'text-base-content/40'
                }`}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

import { useCallback, useLayoutEffect, useRef } from 'react';
import { animated, useSpring } from '@react-spring/web';
import type { LinkOpenBehavior } from '../../../../hooks/use-link-behavior';
import { TAB_SPRING_CONFIG } from '../../../ui/tabs/tabs-config';
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
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** First measurement must snap the pill into place instead of sliding in from 0. */
  const hasInitialized = useRef(false);

  const [pillStyle, pillApi] = useSpring(() => ({
    x: 0,
    width: 0,
    config: TAB_SPRING_CONFIG,
  }));

  const handleSelect = useCallback(
    (newValue: LinkOpenBehavior) => {
      onChange(newValue);
    },
    [onChange]
  );

  useLayoutEffect(() => {
    const activeIndex = OPTIONS.findIndex((option) => option.value === value);
    const activeButton = buttonRefs.current[activeIndex];
    if (!activeButton) return;

    const target = {
      x: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    };

    pillApi.start({
      to: target,
      immediate: !hasInitialized.current || prefersReducedMotion,
    });

    hasInitialized.current = true;
  }, [value, pillApi, prefersReducedMotion]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-base-content">Link opening behavior</span>
        <span className="text-xs text-base-content/50">Choose how PR links open when clicked</span>
      </div>

      <div ref={trackRef} className="relative flex gap-1 p-1 bg-base-200 rounded-lg">
        <animated.div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-md bg-base-100 shadow-sm pointer-events-none"
          style={{
            transform: pillStyle.x.to((x) => `translateX(${x}px)`),
            width: pillStyle.width,
            left: 0,
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

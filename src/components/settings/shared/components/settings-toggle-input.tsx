import { forwardRef, useCallback } from 'react';
import { animated, useSpring } from '@react-spring/web';
import type { ChangeEvent, ComponentProps } from 'react';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { SETTINGS_SPRING_SNAPPY, SETTINGS_SPRING_SOFT } from '../animation/settings-motion';

type ToggleInputProps = Omit<ComponentProps<'input'>, 'type'>;

/**
 * DaisyUI `toggle` checkbox with a small scale “bump” on change so settings switches feel
 * aligned with other react-spring polish in the app without fighting the native toggle motion.
 */
export const SettingsToggleInput = forwardRef<HTMLInputElement, ToggleInputProps>(
  function SettingsToggleInput({ onChange, className, disabled, ...rest }, ref) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const [{ scale }, api] = useSpring(() => ({
      scale: 1,
      config: SETTINGS_SPRING_SOFT,
    }));

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
        if (prefersReducedMotion || disabled) return;
        void api.start({
          from: { scale: 0.9 },
          to: { scale: 1 },
          config: SETTINGS_SPRING_SNAPPY,
        });
      },
      [api, disabled, onChange, prefersReducedMotion]
    );

    return (
      <animated.span
        className="inline-flex shrink-0 origin-center will-change-transform"
        style={{ transform: scale.to((s) => `scale(${s})`) }}
      >
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className={className}
          {...rest}
          onChange={handleChange}
        />
      </animated.span>
    );
  }
);

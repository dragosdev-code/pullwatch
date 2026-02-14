import React, { useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type { Tab } from './hook/use-tabs';

type AnimPhase = 'idle' | 'pressed' | 'releasing';

interface AnimatedTabButtonProps {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

const BUTTON_PHASE_STYLES: Record<AnimPhase, React.CSSProperties> = {
  idle: {
    transform: 'translateY(0)',
    transition: 'transform 0.18s ease-out',
  },
  pressed: {
    transform: 'translateY(2px)',
    transition: 'transform 0.09s cubic-bezier(0.2, 0, 0, 1)',
  },
  releasing: {
    transform: 'translateY(0)',
    transition: 'transform 0.42s cubic-bezier(0.22, 1.4, 0.36, 1)',
  },
};

const FEEDBACK_LAYER_STYLES: Record<AnimPhase, React.CSSProperties> = {
  idle: {
    transform: 'scale(1)',
    opacity: 0,
    transition: 'transform 0.22s ease-out, opacity 0.2s ease',
  },
  pressed: {
    transform: 'scale(0.935)',
    opacity: 1,
    transition: 'transform 0.1s cubic-bezier(0.2, 0, 0, 1), opacity 0.1s ease-out',
  },
  releasing: {
    transform: 'scale(1.02)',
    opacity: 0.08,
    transition: 'transform 0.42s cubic-bezier(0.22, 1.4, 0.36, 1), opacity 0.26s ease-out',
  },
};

export const AnimatedTabButton: React.FC<AnimatedTabButtonProps> = ({
  tab,
  isActive,
  onClick,
  disabled = false,
  buttonRef,
}) => {
  const [phase, setPhase] = useState<AnimPhase>('idle');
  const pressedRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (disabled) return;
    pressedRef.current = true;
    setPhase('pressed');
  }, [disabled]);

  const handleRelease = useCallback(() => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    setPhase('releasing');
  }, []);

  const handleTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLSpanElement>) => {
      if (phase === 'releasing' && event.propertyName === 'transform') {
        setPhase('idle');
      }
    },
    [phase]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      onClick();
    }
  }, [disabled, onClick]);

  return (
    <button
      ref={buttonRef}
      role="tab"
      style={BUTTON_PHASE_STYLES[phase]}
      className={clsx(
        'tab relative overflow-hidden flex-1 text-xs font-medium',
        isActive ? 'text-gray-900! hover:text-gray-900!' : 'text-gray-500! hover:text-gray-900!',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      )}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handleRelease}
      onPointerLeave={handleRelease}
      onPointerCancel={handleRelease}
      disabled={disabled}
      aria-selected={isActive}
      aria-controls={`tabpanel-${tab.id}`}
      id={`tab-${tab.id}`}
    >
      <span
        aria-hidden
        style={FEEDBACK_LAYER_STYLES[phase]}
        className={clsx('pointer-events-none absolute inset-0 rounded-md bg-blue-600/8')}
        onTransitionEnd={handleTransitionEnd}
      />
      <span className="relative z-10 flex items-center gap-1.5">
        {tab.label}
        {tab.count !== undefined && (
          <span
            className={clsx(
              'px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center',
              isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            )}
          >
            {tab.count}
          </span>
        )}
      </span>
    </button>
  );
};

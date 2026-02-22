import React, { useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type { Tab } from './types';
import { CountBadge } from '../count-badge';

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
    transition: 'transform 0.05s ease-out',
  },
  pressed: {
    transform: 'translateY(2px)',
    transition: 'transform 0.05s ease-out',
  },
  releasing: {
    transform: 'translateY(0)',
    transition: 'transform 0.05s ease-out',
  },
};

const FEEDBACK_LAYER_STYLES: Record<AnimPhase, React.CSSProperties> = {
  idle: {
    transform: 'scale(1)',
    opacity: 0,
    transition: 'transform 0.1s ease-out, opacity 0.05s ease',
  },
  pressed: {
    transform: 'scale(0.900)',
    opacity: 1,
    transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.1s ease-out',
  },
  releasing: {
    transform: 'scale(1.05)',
    opacity: 0.08,
    transition: 'transform 0.3s cubic-bezier(0.22, 1.4, 0.36, 1), opacity 0.25s ease-out',
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
        'tab group relative overflow-hidden flex-1 text-xs font-medium',
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
        className={clsx('pointer-events-none absolute inset-0 rounded-md bg-primary/8')}
        onTransitionEnd={handleTransitionEnd}
      />
      <span
        className={clsx(
          'relative z-10 flex items-center gap-1.5 transition-colors duration-300',
          isActive ? 'text-base-content!' : 'text-base-content/50!',
          !disabled && !isActive && 'group-hover:text-base-content!'
        )}
      >
        {tab.label}
        {tab.count !== undefined && (
          <CountBadge value={tab.count} size="sm" tone={isActive ? 'primary' : 'neutral'} />
        )}
      </span>
    </button>
  );
};

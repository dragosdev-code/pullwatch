import { useState, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { SettingsPage } from './settings-page';
import { GearIcon } from '../ui/icons';

type SettingsPosition = 'left' | 'center' | 'right';

const positionConfig = {
  left: {
    clipPathOrigin: '2px calc(100% - 2px)',
    iconClassName: 'absolute bottom-1.5 left-1.5 text-primary',
    idleTransform: 'translate(-25%, 25%)',
    hoverTransform: 'translate(-7%, 7%)',
  },
  center: {
    clipPathOrigin: '50% calc(100% - 2px)',
    iconClassName: 'absolute bottom-1.5 left-1/2 text-primary',
    idleTransform: 'translate(-50%, 25%)',
    hoverTransform: 'translate(-50%, 7%)',
  },
  right: {
    clipPathOrigin: 'calc(100% - 2px) calc(100% - 2px)',
    iconClassName: 'absolute bottom-1.5 right-1.5 text-primary',
    idleTransform: 'translate(25%, 25%)',
    hoverTransform: 'translate(7%, 7%)',
  },
} as const;

interface SettingsOverlayProps {
  position?: SettingsPosition;
}

export const SettingsOverlay = ({ position = 'left' }: SettingsOverlayProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const config = positionConfig[position];

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setIsHovered(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Circle radius: controls the clip-path reveal from the chosen position
  const { radius } = useSpring({
    radius: isOpen ? 600 : isHovered ? 40 : 30,
    config: isOpen
      ? { tension: 100, friction: 20 } // smooth expansion
      : { tension: 200, friction: 26 }, // snappier hover / close
  });

  // Content fade: delayed on open so circle expands first, immediate on close
  const { contentOpacity } = useSpring({
    contentOpacity: isOpen ? 1 : 0,
    delay: isOpen ? 180 : 0,
    config: { tension: 200, friction: 26 },
  });

  return (
    <animated.div
      className="absolute inset-0 z-50 bg-base-200"
      style={{
        clipPath: radius.to((r: number) => `circle(${r}px at ${config.clipPathOrigin})`),
        cursor: isOpen ? 'default' : 'pointer',
      }}
      onMouseEnter={() => {
        if (!isOpen) setIsHovered(true);
      }}
      onMouseLeave={() => {
        if (!isOpen) setIsHovered(false);
      }}
      onClick={() => {
        if (!isOpen) handleOpen();
      }}
      role={!isOpen ? 'button' : undefined}
      aria-label={!isOpen ? 'Open settings' : undefined}
      tabIndex={!isOpen ? 0 : undefined}
    >
      {/* Settings page content */}
      <animated.div
        style={{
          opacity: contentOpacity,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        className="absolute inset-0"
      >
        <SettingsPage onClose={handleClose} />
      </animated.div>

      {/* Gear icon — half-visible in idle, fully visible on hover, hidden when open */}
      <div
        className={config.iconClassName}
        style={{
          transform: isHovered && !isOpen ? config.hoverTransform : config.idleTransform,
          opacity: isOpen ? 0 : 1,
          // Opening: hide gear immediately. Closing: reveal gear with delay
          transition: isOpen
            ? 'transform 0.3s ease, opacity 0.15s ease'
            : 'transform 0.3s ease, opacity 0.2s ease 0.4s',
          pointerEvents: 'none',
        }}
      >
        <GearIcon
          className="size-6"
          style={{
            animation: 'settings-spin 2.5s linear infinite',
            animationPlayState: isHovered && !isOpen ? 'running' : 'paused',
          }}
        />
      </div>
    </animated.div>
  );
};

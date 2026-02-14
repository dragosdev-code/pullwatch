import { useState, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { SettingsPage } from './settings-page';

type SettingsPosition = 'left' | 'center' | 'right';

const positionConfig = {
  left: {
    clipPathOrigin: '2px calc(100% - 2px)',
    iconClassName: 'absolute bottom-1.5 left-1.5 text-indigo-400',
    idleTransform: 'translate(-25%, 25%)',
    hoverTransform: 'translate(-7%, 7%)',
  },
  center: {
    clipPathOrigin: '50% calc(100% - 2px)',
    iconClassName: 'absolute bottom-1.5 left-1/2 text-indigo-400',
    idleTransform: 'translate(-50%, 25%)',
    hoverTransform: 'translate(-50%, 7%)',
  },
  right: {
    clipPathOrigin: 'calc(100% - 2px) calc(100% - 2px)',
    iconClassName: 'absolute bottom-1.5 right-1.5 text-indigo-400',
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
      className="absolute inset-0 z-50 bg-indigo-50"
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
          style={{
            animation: 'settings-spin 2.5s linear infinite',
            animationPlayState: isHovered && !isOpen ? 'running' : 'paused',
          }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </div>
    </animated.div>
  );
};

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { SettingsPage } from './settings-page';
import { GearIcon } from '../../ui/icons';

/** Buffer past the exact diagonal so sub-pixel rounding never exposes a corner. */
const RADIUS_BUFFER_PX = 8;
/** Matches the current popup's default diagonal (~551px for 380×400) + buffer.
 *  Used until the first layout measurement lands; ResizeObserver then retargets. */
const FALLBACK_OPEN_RADIUS = 560;

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
  const [openRadius, setOpenRadius] = useState(FALLBACK_OPEN_RADIUS);
  const overlayRef = useRef<HTMLDivElement>(null);

  const config = positionConfig[position];

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setIsHovered(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Size the reveal circle to the popup's diagonal so the clip-path always covers every corner,
  // regardless of the active popup-size preset. ResizeObserver keeps it in sync when the preset changes.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setOpenRadius(Math.ceil(Math.hypot(width, height)) + RADIUS_BUFFER_PX);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Circle radius: controls the clip-path reveal from the chosen position.
  // Imperative API so that retargeting the radius *while already open* (container resize) can snap
  // instantly — otherwise the user sees a visible re-expansion animation in the newly-exposed corner.
  const [{ radius }, radiusApi] = useSpring(() => ({ radius: 30 }));
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    // Open → open retarget (resize): snap, don't animate.
    if (wasOpen && isOpen) {
      radiusApi.set({ radius: openRadius });
      return;
    }

    // State transitions (open/close/hover): animate.
    radiusApi.start({
      radius: isOpen ? openRadius : isHovered ? 40 : 30,
      config: isOpen
        ? { tension: 100, friction: 20 } // smooth expansion
        : { tension: 200, friction: 26 }, // snappier hover / close
    });
  }, [isOpen, isHovered, openRadius, radiusApi]);

  // Content fade: delayed on open so circle expands first, immediate on close
  const { contentOpacity } = useSpring({
    contentOpacity: isOpen ? 1 : 0,
    delay: isOpen ? 180 : 0,
    config: { tension: 200, friction: 26 },
  });

  return (
    <animated.div
      ref={overlayRef}
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

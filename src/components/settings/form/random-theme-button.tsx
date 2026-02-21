import { useState } from 'react';
import { useSpring, animated, to } from '@react-spring/web';

interface RandomThemeButtonProps {
  themes: readonly string[];
  currentTheme: string;
  onRandomize: (theme: string) => void;
  onScrollToTheme?: (theme: string) => void;
}

const DiceIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="size-4"
      aria-hidden="true"
    >
      {/* Die body */}
      <rect x="2" y="2" width="20" height="20" rx="4" ry="4" fill="currentColor" />
      {/* 5-pip face — pips punched out in a contrasting color */}
      <circle cx="7" cy="7" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="17" cy="7" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="12" cy="12" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="7" cy="17" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
      <circle cx="17" cy="17" r="1.5" fill="var(--color-base-100, #fff)" opacity="0.85" />
    </svg>
  );
};

export const RandomThemeButton = ({
  themes,
  currentTheme,
  onRandomize,
  onScrollToTheme,
}: RandomThemeButtonProps) => {
  const [animating, setAnimating] = useState(false);

  const [springs, api] = useSpring(() => ({
    rotate: 0,
    scale: 1,
  }));

  const handleRandomize = () => {
    if (animating) return;
    setAnimating(true);

    const candidates = themes.filter((t) => t !== currentTheme);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    api.start({
      from: { rotate: 0, scale: 1.25 },
      to: async (next) => {
        await next({
          rotate: 180,
          scale: 2.25,
          config: { tension: 280, friction: 10 },
        });
        await next({
          rotate: 360,
          scale: 1,
          config: { tension: 180, friction: 14 },
        });
      },
      onRest: () => {
        onRandomize(pick);
        setAnimating(false);
        api.set({ rotate: 0, scale: 1 });
        onScrollToTheme?.(pick);
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleRandomize}
      title="Random theme"
      disabled={animating}
      className="flex items-center gap-1.5 text-xs text-base-content/50 hover:text-primary transition-colors duration-150 cursor-pointer disabled:opacity-60"
    >
      <animated.span
        style={{
          display: 'inline-flex',
          transform: to([springs.rotate, springs.scale], (r, s) => `rotate(${r}deg) scale(${s})`),
          transformOrigin: 'center',
        }}
      >
        <DiceIcon />
      </animated.span>
      <span>Random</span>
    </button>
  );
};

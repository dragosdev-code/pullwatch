import { useState } from 'react';
import { useSpring, animated, to } from '@react-spring/web';
import { DiceIcon } from '../../ui/icons';

interface RandomThemeButtonProps {
  themes: readonly string[];
  currentTheme: string;
  onRandomize: (theme: string) => void;
  onScrollToTheme?: (theme: string) => void;
}

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
        <DiceIcon className="size-4" />
      </animated.span>
      <span>Random</span>
    </button>
  );
};

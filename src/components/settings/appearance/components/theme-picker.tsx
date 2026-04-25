import { useCallback, useState } from 'react';
import { useTheme } from '@src/hooks/use-theme';
import { THEMES, type RippleOrigin } from '../themes';
import { useFinePointer } from '../hooks/use-fine-pointer';
import { useThemeListScroll } from '../hooks/use-theme-list-scroll';
import { ThemeRow } from './theme-row';
import { RandomThemeButton } from './random-theme-button';

export const ThemePicker = () => {
  const { theme, setTheme, isThemeLoaded } = useTheme();
  const { scrollRef, registerItem, scrollToTheme } = useThemeListScroll({
    activeTheme: theme,
    ready: isThemeLoaded,
  });
  const [isRollingRandom, setIsRollingRandom] = useState(false);
  const magneticEnabled = useFinePointer();

  const handleSelect = useCallback(
    (name: string, origin: RippleOrigin) => setTheme(name, origin),
    [setTheme]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-base-content/50">Select a theme</span>
        <RandomThemeButton
          themes={THEMES}
          currentTheme={theme}
          onRandomize={setTheme}
          onScrollToTheme={scrollToTheme}
          onAnimatingChange={setIsRollingRandom}
        />
      </div>

      <div className="bg-base-100 border border-base-300 overflow-hidden">
        <div ref={scrollRef} className="overflow-y-auto custom-scrollbar max-h-48">
          {THEMES.map((name) => (
            <ThemeRow
              key={name}
              name={name}
              isActive={theme === name}
              disabled={isRollingRandom}
              magneticEnabled={magneticEnabled}
              registerButton={registerItem}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

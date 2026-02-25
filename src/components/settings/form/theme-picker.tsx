import { useCallback, useEffect, useRef } from 'react';
import { useTheme } from '../../../hooks/use-theme';
import { RandomThemeButton } from './random-theme-button';
import { CheckIcon } from '../../ui/icons';

const THEMES = [
  'light',
  'dark',
  'cupcake',
  'bumblebee',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'cyberpunk',
  'valentine',
  'halloween',
  'garden',
  'forest',
  'aqua',
  'lofi',
  'pastel',
  'fantasy',
  'wireframe',
  'black',
  'luxury',
  'dracula',
  'cmyk',
  'autumn',
  'business',
  'acid',
  'lemonade',
  'night',
  'coffee',
  'winter',
  'dim',
  'nord',
  'sunset',
  'caramellatte',
  'abyss',
  'silk',
] as const;

interface ThemeSwatchProps {
  name: string;
  isActive: boolean;
}

const ThemeSwatch = ({ name, isActive }: ThemeSwatchProps) => {
  return (
    <div
      data-theme={name}
      className={`
        relative overflow-hidden rounded shrink-0
        w-8 h-6
        shadow-sm
        transition-all duration-200
        ${isActive ? 'ring-2 ring-primary shadow-sm' : 'ring-1 ring-black/5'}
      `}
    >
      {/* Base background */}
      <div className="absolute inset-0 bg-base-100" />

      {/* Left accent border - like PR items */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

      {/* Color dots representing the theme */}
      <div className="absolute inset-0 flex items-center justify-center gap-0.5 pl-1">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
      </div>
    </div>
  );
};

export const ThemePicker = () => {
  const { theme, setTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasMountedRef = useRef(false);

  const scrollToTheme = useCallback((name: string, smooth = true) => {
    const container = scrollRef.current;
    const item = itemRefs.current.get(name);
    if (!container || !item) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    const currentOffset = itemRect.top - containerRect.top;
    const centeredOffset = (container.clientHeight - item.offsetHeight) / 2;

    container.scrollTo({
      top: container.scrollTop + currentOffset - centeredOffset,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, []);

  // Scroll to the selected theme only on initial mount (settings overlay opens)
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    const timer = setTimeout(() => {
      scrollToTheme(theme, false);
    }, 50);
    return () => clearTimeout(timer);
  }, [theme, scrollToTheme]);

  return (
    <div className="flex flex-col gap-2">
      {/* Header row with dice button */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-base-content/50">Select a theme</span>
        <RandomThemeButton
          themes={THEMES}
          currentTheme={theme}
          onRandomize={setTheme}
          onScrollToTheme={scrollToTheme}
        />
      </div>

      {/* Scrollable theme list - styled like extension popup list */}
      <div className="bg-base-100 border border-base-300 overflow-hidden">
        <div ref={scrollRef} className="overflow-y-auto custom-scrollbar max-h-48">
          {THEMES.map((name) => {
            const isActive = theme === name;
            return (
              <button
                key={name}
                ref={(el) => {
                  if (el) itemRefs.current.set(name, el);
                  else itemRefs.current.delete(name);
                }}
                type="button"
                onClick={() => setTheme(name)}
                className={`flex items-center gap-3 px-4 py-2.5 w-full transition-all duration-150 cursor-pointer border-b border-base-200 last:border-b-0 ${
                  isActive
                    ? 'bg-base-200/80 border-l-2 border-l-primary'
                    : 'hover:bg-base-200/50 border-l-2 border-l-transparent'
                }`}
              >
                {/* Compact theme swatch */}
                <ThemeSwatch name={name} isActive={isActive} />

                <span className="flex-1 text-sm text-left text-base-content capitalize">
                  {name}
                </span>

                {isActive && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

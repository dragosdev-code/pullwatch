import { useRef } from 'react';
import { useTheme } from '../../../hooks/use-theme';
import { RandomThemeButton } from './random-theme-button';

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

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className="size-3 shrink-0 text-primary"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export const ThemePicker = () => {
  const { theme, setTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const scrollToTheme = (name: string) => {
    const container = scrollRef.current;
    const item = itemRefs.current.get(name);
    if (!container || !item) return;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    if (itemTop < containerTop || itemBottom > containerBottom) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

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

      {/* Scrollable theme list */}
      <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
        <div ref={scrollRef} className="overflow-y-auto custom-scrollbar max-h-33">
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
                className={`flex items-center gap-3 px-3 py-2 w-full transition-colors duration-150 cursor-pointer ${
                  isActive ? 'bg-base-200' : 'hover:bg-base-200'
                }`}
              >
                {/* Color swatch — rendered with that theme's own colors */}
                <div
                  data-theme={name}
                  className="bg-base-100 grid shrink-0 grid-cols-2 gap-0.5 rounded-md p-1 shadow-sm"
                >
                  <div className="bg-base-content size-1.5 rounded-full" />
                  <div className="bg-primary size-1.5 rounded-full" />
                  <div className="bg-secondary size-1.5 rounded-full" />
                  <div className="bg-accent size-1.5 rounded-full" />
                </div>

                <span className="flex-1 text-sm text-left text-base-content capitalize">
                  {name}
                </span>

                {isActive && <CheckIcon />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

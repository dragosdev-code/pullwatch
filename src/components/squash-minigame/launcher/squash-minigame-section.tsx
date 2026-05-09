import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { PlayIcon } from '@heroicons/react/24/solid';
import { useSquashMinigameExperience } from '../squash-minigame-experience-provider';
import { NeoTerminalLauncher } from './neo-terminal-launcher';

/**
 * Settings page entry point. Hidden until the user opts in (`stats.hasDiscovered` via
 * `discoverMinigame`), after the popup-open CTA threshold.
 * Renders nothing while stats hydrate to avoid a flash of the section as the popup boots.
 *
 * Custom accordion (button + animated grid row) instead of DaisyUI `collapse` /
 * native `<details>` — the popup environment was rendering both as a 1px strip with
 * the summary content invisible. The grid `0fr → 1fr` trick gives a smooth height
 * animation without measuring scrollHeight.
 */
export function SquashMinigameSection() {
  const { stats, ready, openSquashGame } = useSquashMinigameExperience();
  const [open, setOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, ready, stats?.hasDiscovered]);

  if (!ready || !stats) return null;
  if (!stats.hasDiscovered) return null;

  return (
    <div
      data-testid="squash-minigame-collapse"
      data-open={open ? 'true' : 'false'}
      className={clsx(
        'group/squash relative w-full shrink-0 overflow-hidden rounded-xl border bg-base-100 transition-[border-color,box-shadow] duration-300',
        open
          ? 'border-primary/70 shadow-[0_0_28px_-8px_var(--color-primary)]'
          : 'border-primary/30 shadow-[0_0_18px_-14px_var(--color-primary)] hover:border-primary/60 hover:shadow-[0_0_22px_-10px_var(--color-primary)]'
      )}
    >
      <button
        type="button"
        data-testid="squash-minigame-collapse-summary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        style={{ display: 'flex', minHeight: '48px' }}
        className="w-full items-center gap-2 bg-base-200 px-4 py-3 text-left transition-colors duration-200 hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span
          className={clsx(
            'inline-flex size-6 items-center justify-center rounded border border-primary/50 bg-primary/15 text-primary transition-[transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            open
              ? 'rotate-90 border-primary bg-primary/25'
              : 'group-hover/squash:scale-110 group-hover/squash:border-primary'
          )}
          aria-hidden="true"
        >
          <PlayIcon className="size-4" />
        </span>
        <span className="font-mono text-sm font-semibold uppercase tracking-wider text-primary">
          Squash the bugs
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-base-content/60 sm:inline">
            {open ? 'collapse' : 'expand'}
          </span>
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-accent">
            v0.42
          </span>
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-label="Squash the bugs minigame launcher"
        aria-hidden={!open}
        style={{
          height: open ? `${contentHeight}px` : '0px',
          opacity: open ? 1 : 0,
          transition: open
            ? 'height 480ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease-out 80ms'
            : 'height 360ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease-in',
          overflow: 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          willChange: 'height, opacity',
        }}
      >
        <div ref={contentRef} className="border-t border-primary/30 px-3 pt-3 pb-3">
          <NeoTerminalLauncher stats={stats} onRequestPlayMode={openSquashGame} />
        </div>
      </div>
    </div>
  );
}

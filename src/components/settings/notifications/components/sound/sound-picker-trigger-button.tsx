import { MusicalNoteIcon } from '@heroicons/react/24/outline';

export interface SoundPickerTriggerButtonProps {
  displayName: string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * WHY [UX]: Invisible grid “ghosts” size the pill to max(idle row, Change-only row) so short
 * names still fit “Change”, and long names don’t collapse on hover. Hover keeps animated
 * opacity/gap/icon width (no translateY on label — that was worse for compositing). `contain:layout`
 * limits invalidation; document-level grayscale AA is set on `#root` in app.css for the popup.
 */
export const SoundPickerTriggerButton = ({
  displayName,
  disabled,
  onClick,
}: SoundPickerTriggerButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="group relative inline-grid max-w-full cursor-pointer grid-cols-1 rounded-full bg-primary/10 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20 transition-[background-color,box-shadow] duration-200 contain-[layout] hover:bg-primary/15 hover:ring-primary/40 hover:shadow-sm disabled:cursor-not-allowed"
  >
    <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 px-2.5 opacity-0 pointer-events-none">
      <MusicalNoteIcon className="size-3 shrink-0" strokeWidth={2} />
      <span className="min-w-0 max-w-48 truncate">{displayName}</span>
    </span>
    <span className="col-start-1 row-start-1 flex min-w-0 items-center px-2.5 opacity-0 pointer-events-none">
      <span className="whitespace-nowrap font-semibold tracking-wide">Change</span>
    </span>

    <span className="col-start-1 row-start-1 z-10 flex min-w-0 items-center gap-1.5 px-2.5 transition-[gap] duration-300 ease-out motion-reduce:duration-0 group-hover:gap-0">
      <span className="flex w-3 shrink-0 justify-center overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:duration-0 group-hover:w-0 group-hover:opacity-0">
        <MusicalNoteIcon className="size-3 shrink-0" strokeWidth={2} />
      </span>
      <span className="relative min-h-[1.25em] min-w-0 max-w-48 flex-1 overflow-hidden">
        <span className="block truncate transition-opacity duration-300 ease-out motion-reduce:duration-0 opacity-100 group-hover:opacity-0">
          {displayName}
        </span>
        <span className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-center transition-opacity duration-300 ease-out motion-reduce:duration-0 opacity-0 group-hover:opacity-100">
          <span className="whitespace-nowrap font-semibold tracking-wide">Change</span>
        </span>
      </span>
    </span>
  </button>
);

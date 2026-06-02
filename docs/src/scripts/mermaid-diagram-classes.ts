/** Tailwind + DaisyUI classes for diagram UI (scanned by Tailwind from TS). */

export const diagramShell =
  "pw-diagram pw-diagram--pending group my-6 cursor-zoom-in overflow-hidden rounded-box border border-base-300/70 bg-base-100";

export const diagramToolbar =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-base-300 px-3 py-2";

export const diagramHint = "m-0 text-xs leading-5 text-base-content/55";

export const diagramToolbarGroup =
  "flex flex-nowrap items-center justify-end";

export const diagramBtn =
  "btn btn-xs btn-outline btn-square size-7 min-h-7 min-w-7 p-0 shrink-0";

/** Inline: static fit only (no pan/zoom). */
export const diagramViewport =
  "diagram-viewport flex w-full max-h-[min(85vh,720px)] items-center justify-center overflow-hidden px-2 py-3";

export const mermaidInViewport =
  "mermaid m-0 flex w-full justify-center border-0 bg-transparent p-0";

export const mermaidSvg = "block max-w-full";

/** Applied to pre.mermaid before enhancement (loading / no-JS). */
export const mermaidFallback = [
  "overflow-x-auto",
  "max-w-full",
  "my-5",
  "rounded-box",
  "border",
  "border-base-300",
  "bg-base-200/35",
  "p-3",
] as const;

export const modalRoot =
  "pw-diagram-modal fixed inset-0 z-200 flex items-stretch justify-center";

export const modalBackdrop =
  "absolute inset-0 m-0 cursor-pointer border-0 bg-neutral/55 p-0";

export const modalPanel =
  "relative z-10 m-auto flex h-[min(92vh,900px)] w-[min(96vw,1200px)] flex-col rounded-box border border-base-300 bg-base-100 shadow-2xl";

export const modalHeader =
  "flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3";

export const modalTitle = "m-0 text-[0.95rem] font-semibold text-base-content";

export const modalToolbarWrap =
  "flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end";

export const modalViewport =
  "relative flex min-h-0 flex-1 flex-col touch-none overflow-hidden bg-base-200/40";

export const modalCanvas =
  "diagram-canvas relative min-h-0 w-full flex-1 touch-none overflow-hidden";

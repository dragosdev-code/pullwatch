import type { PanzoomObject } from "@panzoom/panzoom";

export const SCALE_LIMITS = {
  maxScale: 3,
  minScale: 0.5,
} as const;

export const MODAL_FIT_MAX_SCALE = 1.25;

/** Inline: scale up or down to fill the card (not capped at 100%). */
export const INLINE_FIT_MAX_SCALE = 4;

/** Matches Tailwind `max-h-[min(85vh,720px)]` on the viewport. */
export const INLINE_VIEWPORT_MAX_HEIGHT_PX = 720;

export function inlineFitBounds(host: HTMLElement, padding = 12) {
  const maxW = Math.max(host.clientWidth - padding * 2, 1);
  const maxH =
    Math.min(window.innerHeight * 0.85, INLINE_VIEWPORT_MAX_HEIGHT_PX) -
    padding * 2;
  return { maxW, maxH: Math.max(maxH, 1), padding };
}

export type FitOptions = {
  padding?: number;
  maxScale?: number;
};

/** Remove Mermaid inline sizing so fit math uses viewBox dimensions. */
export function sanitizeMermaidSvg(svg: SVGSVGElement) {
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.maxWidth = "none";
  svg.style.transform = "";
  svg.style.width = "";
  svg.style.height = "";
}

/**
 * Size the SVG to fill the host (inline, non-interactive).
 * Scales up small diagrams and down large ones to use available space.
 */
export function fitStaticSvg(
  host: HTMLElement,
  svg: SVGSVGElement,
  options: FitOptions = {},
): void {
  if (svg.dataset.diagramSanitized !== "true") {
    sanitizeMermaidSvg(svg);
    svg.dataset.diagramSanitized = "true";
  }

  const pad = options.padding ?? 12;
  const maxScale = options.maxScale ?? INLINE_FIT_MAX_SCALE;
  const { maxW, maxH } = inlineFitBounds(host, pad);

  let bbox: DOMRect;
  try {
    bbox = svg.getBBox();
  } catch {
    return;
  }
  if (bbox.width <= 0 || bbox.height <= 0) return;

  const scale = Math.min(maxW / bbox.width, maxH / bbox.height, maxScale);
  const w = bbox.width * scale;
  const h = bbox.height * scale;

  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;
  svg.style.display = "block";
  svg.style.margin = "0 auto";

  host.style.minHeight = `${Math.ceil(h + pad * 2)}px`;
}

export function scheduleStaticFit(
  host: HTMLElement,
  svg: SVGSVGElement,
  options: FitOptions = {},
  onDone?: () => void,
) {
  requestAnimationFrame(() => {
    fitStaticSvg(host, svg, options);
    onDone?.();
  });
}

/** Pan/zoom fit for fullscreen modal only. */
export function fitAndCenter(
  panzoom: PanzoomObject,
  host: HTMLElement,
  svg: SVGSVGElement,
  options: FitOptions = {},
): number | null {
  const pad = options.padding ?? 32;
  const maxScale = options.maxScale ?? MODAL_FIT_MAX_SCALE;
  const vpW = Math.max(host.clientWidth - pad, 1);
  const vpH = Math.max(host.clientHeight - pad, 1);

  let bbox: DOMRect;
  try {
    bbox = svg.getBBox();
  } catch {
    return null;
  }
  if (bbox.width <= 0 || bbox.height <= 0) return null;

  // Match layout size to viewBox so Panzoom pan limits align with fit math.
  svg.style.width = `${bbox.width}px`;
  svg.style.height = `${bbox.height}px`;
  svg.style.display = "block";

  const fitScale = Math.min(vpW / bbox.width, vpH / bbox.height, maxScale);
  const scale = Math.max(
    SCALE_LIMITS.minScale,
    Math.min(SCALE_LIMITS.maxScale, fitScale),
  );

  panzoom.zoom(scale, { animate: false, force: true });

  const w = bbox.width * scale;
  const h = bbox.height * scale;
  panzoom.pan(
    (host.clientWidth - w) / 2,
    (host.clientHeight - h) / 2,
    { animate: false, force: true },
  );

  return scale;
}

export function scheduleFitAndCenter(
  panzoom: PanzoomObject,
  host: HTMLElement,
  svg: SVGSVGElement,
  options: FitOptions = {},
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fitAndCenter(panzoom, host, svg, options));
  });
}

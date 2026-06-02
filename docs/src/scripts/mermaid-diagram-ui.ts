/**
 * Mermaid diagrams: static fit inline, pan/zoom only in fullscreen modal.
 */
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import {
  diagramShell,
  diagramViewport,
  mermaidInViewport,
  mermaidSvg,
  modalBackdrop,
  modalCanvas,
  modalHeader,
  modalPanel,
  modalRoot,
  modalTitle,
  modalToolbarWrap,
  modalViewport,
} from "./mermaid-diagram-classes";
import {
  INLINE_FIT_MAX_SCALE,
  MODAL_FIT_MAX_SCALE,
  SCALE_LIMITS,
  sanitizeMermaidSvg,
  scheduleFitAndCenter,
  scheduleStaticFit,
} from "./mermaid-diagram-fit";
import { createDiagramToolbar } from "./mermaid-diagram-toolbar";

const MERMAID_SELECTOR = "pre.mermaid";
const ZOOM_STEP = 0.15;
const VIEWPORT_SELECTOR = ".diagram-viewport";
const PENDING_CLASS = "pw-diagram--pending";

type PanzoomBinding = {
  panzoom: PanzoomObject;
  destroy: () => void;
};

type InlineContext = {
  resizeObserver: ResizeObserver | null;
  fitting: boolean;
  lastFitKey: string;
};

const inlineContexts = new WeakMap<HTMLPreElement, InlineContext>();

function bindPanzoom(
  target: SVGSVGElement,
  options: Parameters<typeof Panzoom>[1],
  wheelHost?: HTMLElement | null,
): PanzoomBinding {
  const panzoom = Panzoom(target, options);

  const onWheel = (event: WheelEvent) => {
    panzoom.zoomWithWheel(event);
  };

  if (wheelHost) {
    wheelHost.addEventListener("wheel", onWheel, { passive: false });
  }

  return {
    panzoom,
    destroy: () => {
      if (wheelHost) wheelHost.removeEventListener("wheel", onWheel);
      panzoom.destroy();
    },
  };
}

function styleMermaidSvg(svg: SVGSVGElement) {
  if (svg.dataset.diagramSanitized !== "true") {
    sanitizeMermaidSvg(svg);
    svg.dataset.diagramSanitized = "true";
  }
  svg.classList.add(...mermaidSvg.split(" "));
}

function getDiagramViewport(pre: HTMLPreElement): HTMLElement | null {
  return pre.closest<HTMLElement>(VIEWPORT_SELECTOR);
}

function getDiagramShell(pre: HTMLPreElement): HTMLElement | null {
  return pre.closest<HTMLElement>(".pw-diagram");
}

function revealDiagramShell(shell: HTMLElement) {
  shell.classList.remove(PENDING_CLASS);
  shell.removeAttribute("aria-busy");
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function openFullscreenModal(
  svg: SVGSVGElement,
  title: string,
  returnFocus?: HTMLElement | null,
) {
  document.querySelector(".pw-diagram-modal")?.remove();

  const modal = document.createElement("div");
  modal.className = modalRoot;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", `${title} diagram`);

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = modalBackdrop;
  backdrop.setAttribute("aria-label", "Close diagram");

  const panel = document.createElement("div");
  panel.className = modalPanel;

  const header = document.createElement("div");
  header.className = modalHeader;

  const heading = document.createElement("p");
  heading.className = modalTitle;
  heading.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn btn-sm btn-ghost";
  closeBtn.textContent = "Close";
  closeBtn.setAttribute("aria-label", "Close");

  const toolbarWrap = document.createElement("div");
  toolbarWrap.className = modalToolbarWrap;

  const viewport = document.createElement("div");
  viewport.className = modalViewport;

  const canvas = document.createElement("div");
  canvas.className = modalCanvas;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  styleMermaidSvg(clone);

  canvas.appendChild(clone);
  viewport.appendChild(canvas);

  let panzoomRef: PanzoomObject | null = null;

  const runModalFit = () => {
    if (!panzoomRef) return;
    scheduleFitAndCenter(panzoomRef, canvas, clone, {
      maxScale: MODAL_FIT_MAX_SCALE,
    });
  };

  const modalToolbar = createDiagramToolbar({
    onZoomIn: () => panzoomRef?.zoomIn(),
    onZoomOut: () => panzoomRef?.zoomOut(),
    onReset: runModalFit,
  });

  toolbarWrap.appendChild(modalToolbar);
  header.append(heading, toolbarWrap, closeBtn);
  panel.append(header, viewport);
  modal.append(backdrop, panel);
  document.body.appendChild(modal);

  const { panzoom, destroy: destroyPanzoom } = bindPanzoom(
    clone,
    {
      ...SCALE_LIMITS,
      startScale: 1,
      canvas: true,
      cursor: "grab",
      contain: "outside",
      panOnlyWhenZoomed: true,
      step: ZOOM_STEP,
    },
    canvas,
  );

  panzoomRef = panzoom;
  runModalFit();

  const resizeObserver = new ResizeObserver(
    debounce(() => runModalFit(), 120),
  );
  resizeObserver.observe(canvas);

  const close = () => {
    resizeObserver.disconnect();
    destroyPanzoom();
    modal.remove();
    document.body.classList.remove("overflow-hidden");
    document.removeEventListener("keydown", onKeyDown);
    returnFocus?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onKeyDown);
  document.body.classList.add("overflow-hidden");
  closeBtn.focus();

  modal.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      panzoom.zoomIn();
    } else if (e.key === "-") {
      e.preventDefault();
      panzoom.zoomOut();
    }
  });

  canvas.addEventListener("dblclick", () => runModalFit());
}

function cleanupInlineDiagram(pre: HTMLPreElement) {
  const ctx = inlineContexts.get(pre);
  ctx?.resizeObserver?.disconnect();
  inlineContexts.delete(pre);
  delete pre.dataset.diagramEnhanced;
  delete pre.dataset.diagramReady;

  const shell = getDiagramShell(pre);
  if (shell) {
    shell.classList.add(PENDING_CLASS);
    shell.setAttribute("aria-busy", "true");
  }

  const svg = pre.querySelector("svg");
  if (svg) {
    delete svg.dataset.diagramSanitized;
  }
}

function bindInlineStaticFit(pre: HTMLPreElement, svg: SVGSVGElement) {
  const viewport = getDiagramViewport(pre);
  const shell = getDiagramShell(pre);
  if (!viewport || !shell) return;

  styleMermaidSvg(svg);

  const ctx: InlineContext = inlineContexts.get(pre) ?? {
    resizeObserver: null,
    fitting: false,
    lastFitKey: "",
  };

  const fitOptions = {
    padding: 12,
    maxScale: INLINE_FIT_MAX_SCALE,
  };

  const runFit = () => {
    if (ctx.fitting) return;

    const fitKey = `${viewport.clientWidth}x${viewport.clientHeight}`;
    if (ctx.lastFitKey === fitKey && !shell.classList.contains(PENDING_CLASS)) {
      return;
    }

    ctx.fitting = true;
    ctx.resizeObserver?.disconnect();

    scheduleStaticFit(viewport, svg, fitOptions, () => {
      ctx.lastFitKey = `${viewport.clientWidth}x${viewport.clientHeight}`;
      ctx.fitting = false;
      revealDiagramShell(shell);
      pre.dataset.diagramReady = "true";
      if (!ctx.resizeObserver) {
        ctx.resizeObserver = new ResizeObserver(
          debounce(() => {
            const nextKey = `${viewport.clientWidth}x${viewport.clientHeight}`;
            if (nextKey !== ctx.lastFitKey) runFit();
          }, 150),
        );
      }
      ctx.resizeObserver.observe(viewport);
      inlineContexts.set(pre, ctx);
    });
  };

  inlineContexts.set(pre, ctx);
  runFit();
}

function wrapDiagramShell(pre: HTMLPreElement): HTMLElement {
  const existing = getDiagramShell(pre);
  if (existing instanceof HTMLElement) return existing;

  const shell = document.createElement("div");
  shell.className = diagramShell;
  shell.setAttribute("aria-busy", "true");

  const viewport = document.createElement("div");
  viewport.className = diagramViewport;

  const parent = pre.parentNode;
  if (!parent) return shell;

  parent.insertBefore(shell, pre);
  pre.className = mermaidInViewport;
  viewport.appendChild(pre);
  shell.append(viewport);

  return shell;
}

function enhanceDiagram(pre: HTMLPreElement) {
  if (pre.getAttribute("data-processed") !== "true") return;
  if (pre.dataset.diagramEnhanced === "true") return;

  const svg = pre.querySelector("svg");
  if (!svg) return;

  const pageTitle =
    document.querySelector<HTMLElement>("h1#_top")?.textContent?.trim() ??
    "Diagram";

  const shell = wrapDiagramShell(pre);

  if (!shell.dataset.expandBound) {
    shell.dataset.expandBound = "true";
    shell.title = "Click to open fullscreen";
    shell.addEventListener("click", () => {
      const currentSvg = pre.querySelector("svg");
      if (currentSvg) openFullscreenModal(currentSvg, pageTitle);
    });
  }

  pre.dataset.diagramEnhanced = "true";
  bindInlineStaticFit(pre, svg);
}

function scanDiagrams(root: ParentNode) {
  root.querySelectorAll<HTMLPreElement>(MERMAID_SELECTOR).forEach(enhanceDiagram);
}

function mutationTouchesMermaid(mutation: MutationRecord): boolean {
  if (
    mutation.type === "attributes" &&
    mutation.attributeName === "data-processed" &&
    mutation.target instanceof HTMLPreElement &&
    mutation.target.matches(MERMAID_SELECTOR)
  ) {
    return true;
  }

  for (const node of mutation.addedNodes) {
    if (node instanceof HTMLPreElement && node.matches(MERMAID_SELECTOR)) {
      return true;
    }
    if (
      node instanceof Element &&
      node !== node.closest?.(".pw-diagram") &&
      node.querySelector?.(MERMAID_SELECTOR)
    ) {
      return true;
    }
  }

  return false;
}

export function initMermaidDiagramUi() {
  const root = document.querySelector(".sl-markdown-content") ?? document.body;

  const scheduleScan = () => {
    requestAnimationFrame(() => scanDiagrams(root));
  };

  scheduleScan();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;

    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-processed" &&
        mutation.target instanceof HTMLPreElement &&
        mutation.target.matches(MERMAID_SELECTOR)
      ) {
        const pre = mutation.target;
        if (pre.getAttribute("data-processed") === "true") {
          shouldScan = true;
        } else {
          cleanupInlineDiagram(pre);
        }
        continue;
      }

      if (mutationTouchesMermaid(mutation)) {
        shouldScan = true;
      }
    }

    if (shouldScan) scheduleScan();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-processed"],
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMermaidDiagramUi);
  } else {
    initMermaidDiagramUi();
  }
}

import {
  diagramBtn,
  diagramHint,
  diagramToolbar,
  diagramToolbarGroup,
} from "./mermaid-diagram-classes";

type ToolbarHandlers = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onExpand?: () => void;
  hint?: string;
};

function svgIcon(pathD: string, label: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("size-[1.1em]", "shrink-0");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return { svg, label };
}

const ICONS = {
  zoomOut: svgIcon("M5 12h14", "Zoom out"),
  zoomIn: svgIcon("M12 5v14M5 12h14", "Zoom in"),
  reset: svgIcon(
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5",
    "Fit diagram",
  ),
  expand: svgIcon(
    "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
    "Open fullscreen",
  ),
} as const;

function iconButton(
  icon: (typeof ICONS)[keyof typeof ICONS],
  action: () => void,
) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = diagramBtn;
  btn.title = icon.label;
  btn.setAttribute("aria-label", icon.label);
  btn.appendChild(icon.svg);
  btn.addEventListener("click", action);
  return btn;
}

/** Full controls for fullscreen modal. */
export function createDiagramToolbar(handlers: ToolbarHandlers): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = diagramToolbar;
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Diagram controls");

  const hint = document.createElement("span");
  hint.className = diagramHint;
  hint.textContent = handlers.hint ?? "Drag to pan · Scroll to zoom · Esc to close";

  const group = document.createElement("div");
  group.className = diagramToolbarGroup;

  group.append(
    iconButton(ICONS.zoomOut, handlers.onZoomOut),
    iconButton(ICONS.reset, handlers.onReset),
    iconButton(ICONS.zoomIn, handlers.onZoomIn),
  );

  if (handlers.onExpand) {
    group.append(iconButton(ICONS.expand, handlers.onExpand));
  }

  toolbar.append(hint, group);
  return toolbar;
}

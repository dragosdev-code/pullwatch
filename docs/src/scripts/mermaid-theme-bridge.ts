/**
 * Sole client-side Mermaid renderer for the docs site.
 * Diagrams follow html[data-theme] (light → base, dark → dark).
 */
import type { Mermaid } from "mermaid";
import { pullwatchMermaidConfig } from "../../mermaid.config";

const MERMAID_SELECTOR = "pre.mermaid";
const DEBOUNCE_MS = 75;

let mermaidPromise: Promise<Mermaid> | null = null;
let renderInFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastRenderedTheme: "base" | "dark" | null = null;
let needsFollowUpRender = false;

function getMermaidTheme(): "base" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "base";
}

async function loadMermaid(): Promise<Mermaid> {
  if (mermaidPromise) return mermaidPromise;

  mermaidPromise = import("mermaid").then(async ({ default: mermaid }) => {
    const elkModule = await import("@mermaid-js/layout-elk").catch(() => null);
    if (elkModule?.default) {
      mermaid.registerLayoutLoaders(elkModule.default);
    }
    return mermaid;
  });

  return mermaidPromise;
}

function clearProcessedState() {
  document
    .querySelectorAll<HTMLPreElement>(`${MERMAID_SELECTOR}[data-processed]`)
    .forEach((diagram) => {
      diagram.removeAttribute("data-processed");
    });
}

async function doRender(): Promise<void> {
  const diagrams = document.querySelectorAll<HTMLPreElement>(MERMAID_SELECTOR);
  if (diagrams.length === 0) return;

  const mermaid = await loadMermaid();
  const theme = getMermaidTheme();

  mermaid.initialize({
    ...pullwatchMermaidConfig,
    theme,
    gitGraph: {
      mainBranchName: "main",
      showCommitLabel: true,
      showBranches: true,
      rotateCommitLabel: true,
    },
  });

  for (const diagram of diagrams) {
    if (diagram.hasAttribute("data-processed")) continue;

    if (!diagram.hasAttribute("data-diagram")) {
      diagram.setAttribute("data-diagram", diagram.textContent ?? "");
    }

    const diagramDefinition = diagram.getAttribute("data-diagram") ?? "";
    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;

    try {
      document.getElementById(id)?.remove();
      const { svg } = await mermaid.render(id, diagramDefinition);
      diagram.innerHTML = svg;
      diagram.setAttribute("data-processed", "true");
    } catch (error) {
      console.error("[mermaid-theme-bridge] render error:", error);
      diagram.setAttribute("data-processed", "true");
    }
  }

  lastRenderedTheme = theme;
}

async function renderAllDiagrams(): Promise<void> {
  if (renderInFlight) {
    needsFollowUpRender = true;
    await renderInFlight;
    return;
  }

  renderInFlight = doRender();
  try {
    await renderInFlight;
  } finally {
    renderInFlight = null;
    if (needsFollowUpRender) {
      needsFollowUpRender = false;
      const theme = getMermaidTheme();
      if (lastRenderedTheme !== theme) {
        clearProcessedState();
        await renderAllDiagrams();
      }
    }
  }
}

function scheduleRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    clearProcessedState();
    void renderAllDiagrams();
  }, DEBOUNCE_MS);
}

function observeThemeChanges() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-theme"
      ) {
        scheduleRender();
        return;
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

export function initMermaidThemeBridge() {
  if (!document.querySelector(MERMAID_SELECTOR)) return;

  observeThemeChanges();
  void renderAllDiagrams();

  document.addEventListener("astro:after-swap", () => {
    if (document.querySelector(MERMAID_SELECTOR)) {
      lastRenderedTheme = null;
      clearProcessedState();
      void renderAllDiagrams();
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMermaidThemeBridge);
  } else {
    initMermaidThemeBridge();
  }
}

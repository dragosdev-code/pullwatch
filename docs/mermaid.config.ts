import type { MermaidConfig } from "mermaid";

/** Shared Mermaid tuning for dense architecture diagrams. */
export const pullwatchMermaidConfig: MermaidConfig = {
  startOnLoad: false,
  logLevel: "error",
  theme: "base",
  /** ELK layout (requires `@mermaid-js/layout-elk`; astro-mermaid registers it when installed). */
  layout: "elk",
  themeVariables: {
    fontSize: "16px",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  elk: {
    mergeEdges: false,
    nodePlacementStrategy: "NETWORK_SIMPLEX",
  },
  flowchart: {
    curve: "basis",
    padding: 24,
    nodeSpacing: 65,
    rankSpacing: 85,
    htmlLabels: true,
    useMaxWidth: true,
    defaultRenderer: "elk",
  },
  sequence: {
    diagramMarginX: 48,
    diagramMarginY: 16,
    actorFontSize: 15,
    noteFontSize: 14,
    messageFontSize: 15,
    useMaxWidth: true,
  },
  state: {
    nodeSpacing: 55,
    rankSpacing: 70,
    useMaxWidth: true,
  },
};

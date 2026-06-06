/**
 * Astro integration: transform ```mermaid blocks at build time only.
 * Client rendering is handled by mermaid-theme-bridge.ts.
 */
import { resolve } from "import-meta-resolve";
import type { AstroIntegration } from "astro";
import {
  remarkMermaidPlugin,
  rehypeMermaidPlugin,
} from "./mermaid-markdown-plugins";

export default function mermaidMarkdown(): AstroIntegration {
  return {
    name: "mermaid-markdown",
    hooks: {
      "astro:config:setup": async ({ config, updateConfig }) => {
        const viteOptimizeDepsInclude = ["mermaid"];

        try {
          resolve("@mermaid-js/layout-elk", `${config.root.href}package.json`);
          viteOptimizeDepsInclude.push("@mermaid-js/layout-elk");
        } catch {
          /* optional peer */
        }

        updateConfig({
          markdown: {
            remarkPlugins: [
              ...(config.markdown?.remarkPlugins ?? []),
              remarkMermaidPlugin,
            ],
            rehypePlugins: [
              ...(config.markdown?.rehypePlugins ?? []),
              rehypeMermaidPlugin,
            ],
          },
          vite: {
            optimizeDeps: {
              include: viteOptimizeDepsInclude,
            },
          },
        });
      },
    },
  };
}

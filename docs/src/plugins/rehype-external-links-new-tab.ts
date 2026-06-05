import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

const EXTERNAL_HREF = /^https?:\/\//i;

/** Open absolute http(s) markdown links in a new tab at build time. */
export function rehypeExternalLinksNewTab() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a" || !node.properties) return;

      const href = node.properties.href;
      if (typeof href !== "string" || !EXTERNAL_HREF.test(href)) return;

      node.properties.target = "_blank";
      node.properties.rel = "noopener noreferrer";
    });
  };
}

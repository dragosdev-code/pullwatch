/**
 * Markdown transforms for ```mermaid blocks (from astro-mermaid, without client injection).
 * @see https://github.com/joesaby/astro-mermaid
 */
import { visit } from "unist-util-visit";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";

function isElement(node: ElementContent): node is Element {
  return node.type === "element";
}

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
}

function escapeAttribute(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    const htmlEntities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return htmlEntities[char] ?? char;
  });
}

const ALLOWED_TAG_NAMES = new Set([
  "b",
  "i",
  "u",
  "em",
  "strong",
  "br",
  "hr",
  "sub",
  "sup",
  "span",
  "div",
  "code",
  "pre",
  "img",
  "a",
  "p",
  "ul",
  "ol",
  "li",
]);

function serializeHastChildren(children: HastRoot["children"]): string {
  let result = "";

  for (const child of children) {
    if (child.type === "text") {
      result += child.value;
    } else if (child.type === "element") {
      const tagName = child.tagName;
      if (!ALLOWED_TAG_NAMES.has(tagName)) {
        if (child.children?.length) {
          result += serializeHastChildren(child.children);
        }
        continue;
      }

      const selfClosing = ["br", "hr", "img", "input", "meta", "link"].includes(
        tagName,
      );

      result += `<${tagName}`;

      if (child.properties) {
        for (const [key, value] of Object.entries(child.properties)) {
          if (key !== "className") {
            result += ` ${key}="${escapeAttribute(value)}"`;
          } else if (Array.isArray(value)) {
            result += ` class="${escapeAttribute(value.join(" "))}"`;
          }
        }
      }

      if (selfClosing) {
        result += "/>";
      } else {
        result += ">";
        if (child.children?.length) {
          result += serializeHastChildren(child.children);
        }
        result += `</${tagName}>`;
      }
    }
  }

  return result;
}

export function remarkMermaidPlugin() {
  return async function transformer(tree: MdastRoot) {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid" || !parent || typeof index !== "number") {
        return;
      }

      parent.children[index] = {
        type: "html",
        value: `<pre class="mermaid">${escapeHtml(node.value)}</pre>`,
      };
    });
  };
}

export function rehypeMermaidPlugin() {
  return async function transformer(tree: HastRoot) {
    visit(tree, "element", (node) => {
      const firstChild = node.children?.[0];
      if (
        node.tagName !== "pre" ||
        node.children?.length !== 1 ||
        !firstChild ||
        !isElement(firstChild) ||
        firstChild.tagName !== "code"
      ) {
        return;
      }

      const codeNode = firstChild;
      const className = codeNode.properties?.className;

      if (!Array.isArray(className) || !className.includes("language-mermaid")) {
        return;
      }

      const diagramContent = serializeHastChildren(codeNode.children ?? []);

      node.properties = {
        ...node.properties,
        className: ["mermaid"],
      };

      node.children = [
        {
          type: "text",
          value: escapeHtml(diagramContent),
        },
      ];
    });
  };
}

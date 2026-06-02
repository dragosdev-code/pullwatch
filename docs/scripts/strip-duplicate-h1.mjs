/**
 * Remove leading # H1 from Starlight docs (title comes from frontmatter).
 * Run: node docs/scripts/strip-duplicate-h1.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/content/docs",
);

function walk(dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) entries.push(...walk(full));
    else if (name.name.endsWith(".md") || name.name.endsWith(".mdx"))
      entries.push(full);
  }
  return entries;
}

for (const file of walk(docsDir)) {
  let text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) continue;

  const body = text.slice(match[0].length).replace(/^\s+/, "");
  const stripped = body.replace(/^# [^\n]+\r?\n+/, "");
  if (stripped === body) continue;

  const normalized = stripped.startsWith("\n") ? stripped : `\n\n${stripped}`;
  fs.writeFileSync(file, match[0] + normalized, "utf8");
  console.log("Stripped H1:", path.relative(docsDir, file));
}

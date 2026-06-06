/**
 * Sync PRIVACY.md → docs/src/content/docs/privacy.md
 * Run from repo root: node docs/scripts/sync-privacy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const PRIVACY_SRC = path.join(REPO_ROOT, "PRIVACY.md");
const PRIVACY_DEST = path.join(REPO_ROOT, "docs/src/content/docs/privacy.md");

const GITHUB_PRIVACY =
  "https://github.com/dragosdev-code/pullwatch/blob/main/PRIVACY.md";

const frontmatter = `---
title: Privacy Policy
description: What Pullwatch stores, where it connects, and what it does not collect.
---

`;

const intro = `This page is the full privacy policy for Pullwatch. The same text lives in [PRIVACY.md](${GITHUB_PRIVACY}) at the repository root, which is what the Chrome Web Store listing and GitHub link to. If you are evaluating install permissions, [Getting Started](/getting-started/) walks through each one in context.

---

`;

function stripRootTitle(markdown) {
  return markdown.replace(/^# [^\n]+\n+/, "");
}

function main() {
  const source = fs.readFileSync(PRIVACY_SRC, "utf8");
  const body = stripRootTitle(source).trimEnd();
  fs.writeFileSync(PRIVACY_DEST, `${frontmatter}${intro}${body}\n`, "utf8");
  console.log(`Wrote ${path.relative(REPO_ROOT, PRIVACY_DEST)}`);
}

main();

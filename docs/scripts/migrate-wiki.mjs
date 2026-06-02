/**
 * One-time migration: wiki/*.md → docs/src/content/docs/
 * Run from repo root: node docs/scripts/migrate-wiki.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const WIKI_DIR = path.join(REPO_ROOT, "wiki");
const OUT_DIR = path.join(REPO_ROOT, "docs/src/content/docs");

const GITHUB_BLOB = "https://github.com/dragosdev-code/pullwatch/blob/main";

/** Wiki page name (PascalCase) → content path relative to content/docs */
const SLUG_TO_PATH = {
  Home: "index.md",
  "Getting-Started": "getting-started.md",
  "Architecture-Overview": "architecture/overview.md",
  "Import-paths-and-aliases": "architecture/import-paths-and-aliases.md",
  "The-Service-Worker-Lifecycle": "architecture/service-worker-lifecycle.md",
  "The-Parser-Waterfall": "architecture/parser-waterfall.md",
  "GitHub-Health-and-Outages": "architecture/github-health/index.md",
  "List-Trust-and-Suspect-Lists": "architecture/github-health/list-trust.md",
  "Outage-Banner-and-Statuspage": "architecture/github-health/outage-banner.md",
  "Remote-Configuration": "architecture/remote-configuration.md",
  "Data-Hydration-and-Storage": "architecture/data-hydration-and-storage.md",
  "Popup-and-Background-Communication":
    "architecture/popup-and-background-communication.md",
  "Onboarding-and-Session-Gates": "architecture/onboarding-and-session-gates.md",
  "Notifications-and-Sound": "architecture/notifications-and-sound.md",
  "The-Canary-Monitor": "architecture/canary-monitor.md",
};

const FILES = [
  { wiki: "Home.md", out: "index.md", title: "Welcome to Pullwatch", description: "Long-form tour of how Pullwatch works." },
  { wiki: "Getting-Started.md", out: "getting-started.md", title: "Getting Started", description: "Install, dev commands, and permissions." },
  { wiki: "Architecture-Overview.md", out: "architecture/overview.md", title: "Architecture Overview", description: "Map of every moving part in Pullwatch." },
  { wiki: "Import-paths-and-aliases.md", out: "architecture/import-paths-and-aliases.md", title: "Import paths and aliases", description: "TypeScript path aliases across the extension and popup." },
  { wiki: "The-Service-Worker-Lifecycle.md", out: "architecture/service-worker-lifecycle.md", title: "The Service Worker Lifecycle", description: "Wake, init, alarm, and teardown of the MV3 worker." },
  { wiki: "The-Parser-Waterfall.md", out: "architecture/parser-waterfall.md", title: "The Parser Waterfall", description: "Three-stage parser gauntlet and route fallback." },
  { wiki: "GitHub-Health-and-Outages.md", out: "architecture/github-health/index.md", title: "GitHub Health and Outages", description: "Outage reasons, list trust, and popup banner behavior." },
  { wiki: "List-Trust-and-Suspect-Lists.md", out: "architecture/github-health/list-trust.md", title: "List Trust and Suspect Lists", description: "PrListTrustAssessor, empty confirmation, and tombstones." },
  { wiki: "Outage-Banner-and-Statuspage.md", out: "architecture/github-health/outage-banner.md", title: "Outage Banner and Statuspage", description: "Popup banner copy, Statuspage client, and link gating." },
  { wiki: "Remote-Configuration.md", out: "architecture/remote-configuration.md", title: "Remote Configuration", description: "Bundled vs remote patterns.json and validation." },
  { wiki: "Data-Hydration-and-Storage.md", out: "architecture/data-hydration-and-storage.md", title: "Data Hydration and Storage", description: "chrome.storage.local keys and popup hydration." },
  { wiki: "Popup-and-Background-Communication.md", out: "architecture/popup-and-background-communication.md", title: "Popup and Background Communication", description: "Runtime messages, TanStack Query, and storage listeners." },
  { wiki: "Onboarding-and-Session-Gates.md", out: "architecture/onboarding-and-session-gates.md", title: "Onboarding and Session Gates", description: "Install flow, identity, and reveal overlay phases." },
  { wiki: "Notifications-and-Sound.md", out: "architecture/notifications-and-sound.md", title: "Notifications and Sound", description: "Desktop alerts, offscreen audio, and suppression rules." },
  { wiki: "The-Canary-Monitor.md", out: "architecture/canary-monitor.md", title: "The Canary Monitor", description: "Tier 1/2 parser checks and Discord alerts." },
];

function posixDirname(filePath) {
  const dir = path.posix.dirname(filePath.replace(/\\/g, "/"));
  return dir === "." ? "" : dir;
}

function relativeDocLink(fromOut, wikiSlug) {
  const target = SLUG_TO_PATH[wikiSlug];
  if (!target) return null;
  const fromDir = posixDirname(fromOut);
  const targetParts = target.split("/");
  const targetFile = targetParts.pop();
  const targetDir = targetParts.join("/");

  let common = 0;
  const fromDirParts = fromDir ? fromDir.split("/") : [];
  const targetDirParts = targetDir ? targetDir.split("/") : [];
  while (
    common < fromDirParts.length &&
    common < targetDirParts.length &&
    fromDirParts[common] === targetDirParts[common]
  ) {
    common++;
  }
  const ups = fromDirParts.length - common;
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  const down = targetDirParts.slice(common).join("/");
  const base = down ? `${prefix}${down}/` : prefix;
  const slug = targetFile === "index.md" ? "" : targetFile.replace(/\.md$/, "/");
  return `${base}${slug}`;
}

function toGithubBlob(relPath) {
  const clean = relPath.replace(/^\.\.\//, "").split("#")[0];
  const hash = relPath.includes("#") ? relPath.slice(relPath.indexOf("#")) : "";
  return `${GITHUB_BLOB}/${clean}${hash}`;
}

function transformBody(body, fromOut) {
  let text = body;

  // wiki/ cross-links in repo
  text = text.replace(
    /\]\(\.\.\/wiki\/([^)#]+)(#[^)]+)?\)/g,
    (_, name, hash = "") => {
      const base = name.replace(/\.md$/, "");
      const slug = Object.entries(SLUG_TO_PATH).find(([, p]) =>
        p.endsWith(`${base}.md`) || p.endsWith(`${base}/index.md`),
      )?.[0];
      if (!slug) return `](${GITHUB_BLOB}/wiki/${name}${hash})`;
      return `](${relativeDocLink(fromOut, slug)}${hash})`;
    },
  );

  // extension / canary / src source links
  text = text.replace(
    /\]\(\.\.\/((?:extension|canary|src)\/[^)]+)\)/g,
    (_, rel) => `](${toGithubBlob(rel)})`,
  );

  // Wiki PascalCase internal links
  text = text.replace(/\]\(([A-Za-z0-9-]+)\)/g, (match, slug) => {
    if (slug.startsWith("http") || slug.includes("/")) return match;
    const rel = relativeDocLink(fromOut, slug);
    return rel ? `](${rel})` : match;
  });

  return text;
}

function stripRecentWikiChanges(body) {
  const marker = "## Recent wiki changes";
  const idx = body.indexOf(marker);
  if (idx === -1) return body;
  return body.slice(0, idx).trimEnd() + "\n";
}

for (const { wiki, out, title, description } of FILES) {
  const src = path.join(WIKI_DIR, wiki);
  let body = fs.readFileSync(src, "utf8");

  if (out === "index.md") {
    body = body.replace(/^# Welcome to the Pullwatch Wiki\s*\n+/, "");
    body = body.replace(
      /This wiki is the long form tour/,
      "These docs are the long form tour",
    );
    body = body.replace(/## How this wiki is organised/g, "## How these docs are organised");
    body = body.replace(/The wiki has three tiers/g, "The docs have three tiers");
    body = stripRecentWikiChanges(body);
    body +=
      "\n\n---\n\n## Related docs\n\n- [DOM change runbook](https://github.com/dragosdev-code/pullwatch/blob/main/canary/DOM_CHANGE_RUNBOOK.md) (operational)\n- [Squash minigame docs](https://github.com/dragosdev-code/pullwatch/tree/main/src/components/squash-minigame/docs)\n";
  }

  body = transformBody(body, out);
  body = body.replace(/^# [^\n]+\r?\n+/, "");

  const frontmatter = `---
title: ${JSON.stringify(title).slice(1, -1)}
description: ${JSON.stringify(description).slice(1, -1)}
---

`;

  const dest = path.join(OUT_DIR, out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, frontmatter + body, "utf8");
  console.log(`Wrote ${out}`);
}

console.log("Migration complete.");

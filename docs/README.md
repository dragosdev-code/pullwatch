# Pullwatch documentation site

Starlight docs for [Pullwatch](https://github.com/dragosdev-code/pullwatch). Published at [https://dragosdev-code.github.io/pullwatch/](https://dragosdev-code.github.io/pullwatch/).

## Commands

```bash
npm install
npm run dev      # local preview at http://localhost:4321/pullwatch/
npm run build    # static output in dist/
npm run preview  # serve dist/
npm run check    # astro check (types + content)
```

## Content

Markdown lives in `src/content/docs/`. To re-run the one-time wiki import from `../wiki/`:

```bash
node scripts/migrate-wiki.mjs
```

(from repo root)

## Theming (DaisyUI)

The docs site uses **DaisyUI 5.0.43** and **Tailwind CSS 4.2.2** — the same versions as the extension (`package.json` at repo root). Only **light** and **dark** are available via the header theme dropdown (`src/lib/themes.ts`).

Theme choice is stored under `pr-extension-theme` in `localStorage` (same key as the extension popup).

## Diagrams

Flowcharts use the **[ELK](https://eclipse.dev/elk/)** layout engine (`@mermaid-js/layout-elk`) for clearer large graphs. In the page, diagrams **scale to fill** the card (not draggable). **Click** a diagram for fullscreen pan/zoom; **Esc** closes.

To use Dagre on a single diagram, add YAML frontmatter at the top of the `mermaid` code block (`layout: dagre`). See [Mermaid layouts](https://mermaid.js.org/config/layouts.html).

---
title: Import paths and aliases
description: TypeScript path aliases across the extension and popup.
---


Pullwatch resolves the same logical roots in three places at once: TypeScript (`tsconfig.json` `paths`), Vite (`vite.aliases.ts`), and Vitest (shared `viteResolveAliases`). This page is the contract for _when_ to reach for an alias versus a normal relative import, and _why_ the split exists at all. If you remember one sentence, make it this: **aliases mark a boundary crossing; relatives keep a feature or subsystem readable on the page.**

---

## The two failure modes without a rule

Without an agreed rule, two things happen on every mid sized repo. Imports either sprawl into endless `../../..` chains that break every time a file moves, or everything flips to path aliases on every line and you stop seeing, at a glance, whether a file is talking to its neighbours or reaching across the whole tree.

Pullwatch sits deliberately in the middle. Shared extension code, the popup, and the Vitest entry points all need to agree on where `@common` points, so the editor, `tsc`, and the bundler never disagree. Inside a single subtree (a settings screen importing its own row component, a service importing its interface from the same worker package) a short relative path is still the clearest thing to read.

---

## The aliases, and what each one is for

The table below is the authoritative “which prefix when.” The implementation lives in [tsconfig.json](https://github.com/dragosdev-code/pullwatch/blob/main/tsconfig.json) (for the type checker and the IDE) and [vite.aliases.ts](https://github.com/dragosdev-code/pullwatch/blob/main/vite.aliases.ts) (for Vite and the Vitest configs that import the shared object).

| Alias            | What it is for                                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@common/*`      | Anything under `extension/common/` that another part of the repo needs: types, constants, parsers, `chrome-extension-service`, and so on. Reach for it from `src/`, from `canary/`, from tests, or from another folder under `extension/`. |
| `@background/*`  | The service worker tree when the importer is **not** already inside `extension/background/`. Typical call sites are the canary harness, parser tests that need a real class, or other tooling that intentionally loads worker code.   |
| `@offscreen/*`   | The offscreen document bundle when the importer sits outside `extension/offscreen/`.                                                                                                                                                  |
| `@debug/*`       | Debug helpers when the importer sits outside `extension/debug/`.                                                                                                                                                                       |
| `@src/*`         | A jump between **top level** folders under `src/`: for example `components` to `hooks`, or `hooks` to `stores`. It is not meant for “same feature folder to its own `./components` child.”                                              |
| `@extension/*`   | A rare escape hatch when something under `extension/` is not covered by a narrower alias. If it keeps growing, the folder layout probably wants a rethink rather than another catch all import.                                     |

The usual top level folders under `src/` are `components`, `hooks`, `stores`, `lib`, `services`, `utils`, `diagnostics-surface`, `constants`, `assets`, and `mocks`. Crossing from one of those to another is the moment `@src/...` earns its keep.

---

## What should stay relative

Relative imports are still the default **inside** a coherent slice of the tree. That keeps diffs small when you rename a feature folder and preserves the mental model “everything in this directory belongs together.”

- **`extension/common/`**: import siblings with `./types`, `./constants`, and the like. The shared layer should read like a small library, not like every file starts with `@common/`. For the chrome adapter/client subtree specifically, [extension/common/chrome/index.ts](https://github.com/dragosdev-code/pullwatch/blob/main/extension/common/chrome/index.ts) is an optional barrel (`./chrome` from other `extension/common/` modules) so imports do not sprawl across `adapters/` and `clients/` when you only need the public surface of that layer.
- **`extension/background/`**: `services` importing `../interfaces/...` is correct. You are still inside the worker package; an `@background/interfaces/...` path from the same package adds noise without buying a boundary.
- **`extension/offscreen/`** and **`extension/debug/`**, same story: stay relative inside each tree unless something **outside** that tree needs the symbol.
- **`src/components/...`**: short hops within the components tree, including a feature folder importing its own `./components/...` children, stay relative. That is the same “feature locality” idea as the background worker.
- **Barrel `index.ts` files under `src/`**: keep re-exports relative where that avoids circular imports or pointless churn. The barrels are already a public surface; they do not need to be turned into a wall of `@src` paths.

---

## Layering rules that must not drift

Some boundaries are not just style; they keep the MV3 split honest.

- **`extension/common/`** must not depend on `@background`, `@offscreen`, `@debug`, or `@src`. The shared layer stays below the separate runtimes on purpose. There is one deliberate exception today: the pulls list parser wires in a few concrete parser classes from the worker tree through a **relative** `../background/...` import. Treat that as a documented special case, not a precedent to copy for new code.
- **`src/`** (the popup) must not import `@background/*` or `@offscreen/*`. The UI talks to the worker through `@common/chrome-extension-service` and storage, not by pulling worker modules into the React graph. Oxlint enforces the `@background` half of that for `src/**` (see below).

---

## Keeping config, tests, and lint aligned

If you add a new alias root, it needs to land in **`tsconfig.json` `paths`** and **`viteResolveAliases`** at the same time, or you will get the classic “green in the bundle, red in the editor” split. The default Vitest suite reuses the main Vite config; the canary and remote patterns configs import the shared alias object explicitly, so they stay in lock step without hand copying path strings in three places.

[.oxlintrc.json](https://github.com/dragosdev-code/pullwatch/blob/main/.oxlintrc.json) adds a belt and braces guard: import paths that crawl up with `../` and then reach into `extension/{common,background,offscreen,debug}/` are rejected in favour of the matching alias, and `src/**` may not import `@background/*` at all. That is the machine readable version of the layering rule above.

---

## “Every line an alias” versus “alias at the boundary”

You could prefer a single absolute style everywhere under `src/`, which is a fair choice when uniformity matters more than locality. Pullwatch uses the boundary led style instead: less noise inside a feature, clearer signal when you leave your neighbourhood. Neither option is universally “correct”; this page writes the decision down so future you does not have to reverse engineer it from git history.

---

## What to read next

- **How the three Chrome contexts fit together:** [Architecture Overview](/architecture/overview/).
- **Why the popup must not import the worker directly:** [Popup and Background Communication](/architecture/popup-and-background-communication/).

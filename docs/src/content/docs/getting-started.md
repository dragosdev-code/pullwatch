---
title: Getting Started
description: Install, dev commands, and permissions.
---

This page gets Pullwatch running on your machine in about five minutes, and then explains every permission the extension asks Chrome for, one at a time. If you are here to read source code afterwards, the [Architecture Overview](/architecture/overview/) is the natural next stop.

---

## Install it

### From the Chrome Web Store

**[Add to Chrome](https://chromewebstore.google.com/detail/pullwatch-pr-dashboard-fo/occmgmijpfljojcfifhhjoaeedmcbppl)** from the Chrome Web Store. Sign in to GitHub in Chrome as you normally would, then pin the toolbar icon.

### From source (unpacked)

This is the route for anyone who cloned the repo or wants to try an unreleased build.

**Prerequisites**

- Node.js 18 or later.
- npm (pnpm also works, just substitute it in the commands below).
- Google Chrome or any Chromium based browser that supports Manifest V3 extensions.

**Four commands, in order**

```bash
git clone https://github.com/dragosdev-code/pullwatch.git
cd pullwatch
npm install
npm run icons   # generates every icon size from public/logo.png
npm run build   # outputs the extension into dist/
```

**Load it into Chrome**

1. Open `chrome://extensions` in a new tab.
2. Flip the **Developer mode** toggle in the top right.
3. Click **Load unpacked**.
4. Pick the `dist/` folder from the repo you just built.

That is the whole install. The Pullwatch icon should appear in your extensions menu. Pin it if you want one click access.

---

## Useful scripts

Everything below lives in [package.json](https://github.com/dragosdev-code/pullwatch/blob/main/package.json). You will reach for these during day to day work.

| Script                                           | What it does                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                    | Runs the Vite dev server for fast popup iteration inside a regular browser tab. The service worker is **not** wired up in this mode, so alarms, storage, and runtime messages will not fire. Use it for UI work only. |
| `npm run build`                                  | Full production build. Type checks both the app and the Node side config, then runs Vite. The result lands in `dist/`.                                                                                                |
| `npm test`                                       | Runs the Vitest unit tests in watch mode.                                                                                                                                                                             |
| `npm run test:run`                               | Same tests, one shot, good for CI.                                                                                                                                                                                    |
| `npm run test:ui`                                | Opens the Vitest UI in a browser.                                                                                                                                                                                     |
| `npm run canary:test`                            | Runs the [canary suite](/architecture/canary-monitor/) locally using the current parser patterns.                                                                                                                                |
| `npm run test:remote-patterns`                   | Validates `patterns.json` against the Valibot schema using the default source.                                                                                                                                        |
| `npm run test:remote-patterns:staging`           | Same, but against the `staging` branch of the [pr-live-config](https://github.com/dragosdev-code/pr-live-config) repo.                                                                                                |
| `npm run test:remote-patterns:production`        | Same, but against the `main` branch that production users read.                                                                                                                                                       |
| `npm run test:remote-patterns:production:parity` | Confirms `staging` and `production` agree where they should, so a staged change does not silently shadow live.                                                                                                        |
| `npm run lint`                                   | Runs [oxlint](https://oxc.rs/docs/guide/usage/linter.html).                                                                                                                                                           |
| `npm run lint:fix`                               | Same, with autofix.                                                                                                                                                                                                   |
| `npm run build:analyze`                          | Production build plus a bundle visualiser that opens in your file explorer.                                                                                                                                           |

> **Heads up on `npm run dev`:** the popup boots fine, but because the Chrome APIs are not available in a normal tab, anything that reads or writes `chrome.storage` or sends a runtime message will silently no op. That is expected. For end to end testing, always load the `dist/` build into `chrome://extensions`.

> **Parser fixes and remote config:** A rebuilt extension ships updated regex in [`default-patterns.ts`](https://github.com/dragosdev-code/pullwatch/blob/main/extension/common/default-patterns.ts). You do not need a live `pr-live-config` push to verify locally if bundled patterns load (check the service worker log for `bundled default patterns v…`). Clearing extension storage reloads the bundle; outdated `main` `patterns.json` cannot downgrade a newer [`BUNDLED_PATTERNS_REGISTRY_VERSION`](https://github.com/dragosdev-code/pullwatch/blob/main/extension/common/constants.ts). Production OTA and users with old cached remote versions still need `staging` promoted to `main`; see [Remote Configuration](/architecture/remote-configuration/).

---

## Permissions, explained one by one

All permissions are declared in [public/manifest.json](https://github.com/dragosdev-code/pullwatch/blob/main/public/manifest.json). Each one exists for a single narrow reason. Chrome asks you to approve them at install time, and you deserve a plain English answer for every single one.

### Base permissions

| Permission      | Why it exists                                                                                                                                          | What it does **not** let Pullwatch do                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `storage`       | Saves your PR lists, settings, route hint, rate limit state, and parser patterns inside Chrome's own storage. Everything persists on this device only. | Read or write any cookies, any IndexedDB from other sites, or any files on your filesystem.                              |
| `notifications` | Shows optional desktop alerts when something on your inbox changes. You can turn this off per category in settings.                                    | Show notifications you did not opt into, or track whether you clicked one from outside this extension.                   |
| `alarms`        | Lets the background refresh run on a schedule (every 3 minutes by default) without keeping a tab open.                                                 | Run code continuously in the background; the alarm wakes the service worker briefly and then Chrome shuts it down again. |
| `offscreen`     | Manifest V3 service workers cannot play audio. The [offscreen document](/architecture/notifications-and-sound/) is used to play notification sounds and nothing else. | Render any user facing UI in an offscreen document.                                                                      |

### Host permissions

Host permissions control which origins Pullwatch is allowed to send HTTP requests to. Pullwatch declares exactly four, and each one is narrow.

| Host permission                                                     | Why it exists                                                                                                                               | What it does **not** let Pullwatch do                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `https://github.com/*`                                              | Reads the signed in pulls pages your browser would already render. This is where every PR row comes from.                                   | Post, comment, merge, close, or label anything. Pullwatch only ever issues `GET` requests, never writes.                         |
| `https://avatars.githubusercontent.com/*`                           | Loads avatar images shown next to each PR. These are the same avatar URLs GitHub serves on its own pages.                                   | Read any other data from the avatars host; avatar URLs are public.                                                               |
| `https://raw.githubusercontent.com/dragosdev-code/pr-live-config/*` | Downloads the public regex config file used by the parser. See the [pr-live-config repo](https://github.com/dragosdev-code/pr-live-config). | Reach any other path on `raw.githubusercontent.com`. The prefix is scoped to a single repo owned by the author of the extension. |
| `https://www.githubstatus.com/*`                                    | Reads GitHub's public Statuspage API (`summary.json`) so an outage banner can be corroborated against a real Pull Requests incident. No credentials are sent and the response is cached locally. | Send your session, cookies, or any PR data anywhere. The call is anonymous and read only. |

You can verify the outbound destinations at any time from the browser's DevTools network tab on the service worker. Those four origins are the entire list. No telemetry, no analytics, no third party SDK.

---

## A quick sanity check

Once the extension is loaded, the easiest way to confirm everything wired up correctly is:

1. Open a tab and make sure you are signed in at [github.com](https://github.com).
2. Click the Pullwatch icon in the toolbar. You should see your three tab inbox (**To review**, **Authored**, **Merged**) populate within a few seconds.
3. Open `chrome://extensions`, click **service worker** under the Pullwatch card to open DevTools for the background, and look for the log line confirming the alarm was registered.

If the popup stays empty, the [Onboarding and Session Gates](/architecture/onboarding-and-session-gates/) page covers the three "we could not talk to GitHub" states and how Pullwatch tells you which one you are in.

---

## What to read next

- **You want to understand the code you just built:** head to [Architecture Overview](/architecture/overview/) for a one page map of every moving part.
- **You are interested in how Pullwatch survives Chrome killing the service worker every 30 seconds:** [The Service Worker Lifecycle](/architecture/service-worker-lifecycle/).
- **You are curious how the UI feels instant even on a cold open:** [Data Hydration and Storage](/architecture/data-hydration-and-storage/).

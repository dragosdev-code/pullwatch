---
title: Privacy Policy
description: What Pullwatch stores, where it connects, and what it does not collect.
---

This page is the full privacy policy for Pullwatch. The same text lives in [PRIVACY.md](https://github.com/dragosdev-code/pullwatch/blob/main/PRIVACY.md) at the repository root, which is what the Chrome Web Store listing and GitHub link to. If you are evaluating install permissions, [Getting Started](/getting-started/) walks through each one in context.

---


**Last updated:** June 2026

Pullwatch (“the extension”) is a read-only GitHub pull request inbox for Google Chrome. This policy describes what data the extension handles and where it goes.

## Summary

- Pullwatch does **not** collect analytics and does **not** run its own backend servers.
- Pullwatch does **not** ask for personal access tokens, OAuth authorization, or your GitHub password.
- PR data and operational state stay on **your device** in Chrome storage unless you use Chrome Sync for appearance and notification preferences (see below).
- Network requests go only to the host origins declared in the extension manifest.

## What data Pullwatch uses

### GitHub pull request metadata

The background service worker fetches the same signed-in HTML pages you could open yourself at `github.com` (for example your pulls list). It parses that HTML locally to build lists for **To review**, **Authored**, and **Merged**. Pullwatch does not write to GitHub and does not act on pull requests on your behalf.

### Data stored on your device

| Storage | What it holds |
| ------- | ------------- |
| `chrome.storage.local` | Parsed PR lists, route hints, rate-limit/backoff state, cached GitHub Statuspage responses, remote parser config, and other operational data needed for the inbox. |
| `chrome.storage.sync` | Optional UI preferences (theme, notification toggles, and similar settings) if you use Chrome Sync across your signed-in Chrome profile. |

Nothing in this storage is uploaded by Pullwatch to a server operated by the extension author.

### Optional notifications

If you enable them, Pullwatch may show desktop notifications and play short sounds (via a minimal offscreen document required by Manifest V3). Notification content is derived from PR metadata already on your device. You can disable alerts per category in settings.

## Network destinations

Pullwatch contacts only these origins (also listed in `manifest.json`):

| Origin | Purpose |
| ------ | ------- |
| `https://github.com/*` | Fetch signed-in pulls list HTML; open PR links from the popup using your existing session. |
| `https://avatars.githubusercontent.com/*` | Load author avatar images in the popup. |
| `https://raw.githubusercontent.com/dragosdev-code/pr-live-config/*` | Download a public `patterns.json` file (parser regex updates only; validated before use). No account data is sent. |
| `https://www.githubstatus.com/*` | Read GitHub’s public Statuspage API to show accurate outage banners. No credentials are sent. |

There are no advertising, analytics, or third-party tracking SDKs.

## What Pullwatch does not do

- No sale or sharing of personal data with third parties for marketing.
- No cross-device sync of your PR lists by Pullwatch (lists are local unless you separately use GitHub in the browser).
- No collection of browsing history outside the declared GitHub-related fetches above.

## Permissions (Chrome)

| Permission | Use |
| ---------- | --- |
| `storage` | Persist PR lists and settings on this device. |
| `notifications` | Optional desktop alerts (can be turned off). |
| `alarms` | Scheduled background refresh without an open tab. |
| `offscreen` | Play notification sounds (service workers cannot use audio APIs directly). |

Host permission justifications match the network table above.

## Children

Pullwatch is not directed at children under 13 and does not knowingly collect information from them.

## Changes

Material changes to this policy will be reflected in this file and, when applicable, in the extension’s release notes on GitHub.

## Contact

Questions or privacy concerns: open an issue at [github.com/dragosdev-code/pullwatch/issues](https://github.com/dragosdev-code/pullwatch/issues).

## Open source

Pullwatch is open source. You can review how data is handled in the [repository](https://github.com/dragosdev-code/pullwatch).

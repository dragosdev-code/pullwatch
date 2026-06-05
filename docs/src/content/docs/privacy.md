---
title: Privacy Policy
description: What Pullwatch stores, where it connects, and what it does not collect.
---

This page mirrors the repository [Privacy Policy](https://github.com/dragosdev-code/pullwatch/blob/main/PRIVACY.md). The canonical text lives in `PRIVACY.md` at the repo root; this copy exists so the policy has a stable URL on the docs site.

## Summary

Pullwatch is a read-only GitHub PR inbox for Chrome. It does **not** use analytics, OAuth, or personal access tokens. It reads signed-in GitHub pulls list HTML using your existing browser session, parses it locally, and stores results in `chrome.storage.local` on your device.

Optional desktop notifications and sounds can be disabled per category. A public `patterns.json` file may be fetched from [pr-live-config](https://github.com/dragosdev-code/pr-live-config) for parser updates (data only, validated before use). GitHub’s public Statuspage API may be queried for outage banners; no credentials are sent.

## Storage

| Storage | Contents |
| ------- | -------- |
| `chrome.storage.local` | PR lists, route hints, rate-limit state, cached status responses, remote parser config. |
| `chrome.storage.sync` | Theme and notification preferences when Chrome Sync is enabled. |

Pullwatch does not upload your PR data to servers operated by the extension author.

## Network hosts

Only these origins are contacted (see `manifest.json`):

- `https://github.com/*` — signed-in pulls HTML and PR links.
- `https://avatars.githubusercontent.com/*` — avatars in the UI.
- `https://raw.githubusercontent.com/dragosdev-code/pr-live-config/*` — public parser patterns.
- `https://www.githubstatus.com/*` — public outage status.

## Full policy

For the complete policy (permissions table, children, contact, changes), see **[PRIVACY.md on GitHub](https://github.com/dragosdev-code/pullwatch/blob/main/PRIVACY.md)**.
